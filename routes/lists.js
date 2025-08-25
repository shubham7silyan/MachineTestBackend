const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const List = require('../models/List');
const Agent = require('../models/Agent');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.csv', '.xlsx', '.xls'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV, XLSX, and XLS files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Parse CSV file
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // Normalize column names (case insensitive)
        const normalizedData = {};
        Object.keys(data).forEach(key => {
          const lowerKey = key.toLowerCase().trim();
          if (lowerKey.includes('firstname') || lowerKey.includes('first_name') || lowerKey.includes('first name')) {
            normalizedData.firstName = data[key].trim();
          } else if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number')) {
            normalizedData.phone = data[key].trim();
          } else if (lowerKey.includes('notes') || lowerKey.includes('note') || lowerKey.includes('comments')) {
            normalizedData.notes = data[key].trim();
          }
        });
        
        if (normalizedData.firstName && normalizedData.phone) {
          results.push(normalizedData);
        }
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

// Parse Excel file
const parseExcel = (filePath) => {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
    
    const results = [];
    jsonData.forEach(row => {
      const normalizedData = {};
      Object.keys(row).forEach(key => {
        const lowerKey = key.toLowerCase().trim();
        if (lowerKey.includes('firstname') || lowerKey.includes('first_name') || lowerKey.includes('first name')) {
          normalizedData.firstName = String(row[key]).trim();
        } else if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number')) {
          normalizedData.phone = String(row[key]).trim();
        } else if (lowerKey.includes('notes') || lowerKey.includes('note') || lowerKey.includes('comments')) {
          normalizedData.notes = String(row[key]).trim();
        }
      });
      
      if (normalizedData.firstName && normalizedData.phone) {
        results.push(normalizedData);
      }
    });
    
    return results;
  } catch (error) {
    throw error;
  }
};

// Distribute items among agents
const distributeItems = (items, agents) => {
  const distributions = [];
  const itemsPerAgent = Math.floor(items.length / agents.length);
  const remainingItems = items.length % agents.length;
  
  let currentIndex = 0;
  
  agents.forEach((agent, index) => {
    const itemsForThisAgent = itemsPerAgent + (index < remainingItems ? 1 : 0);
    const agentItems = items.slice(currentIndex, currentIndex + itemsForThisAgent);
    
    distributions.push({
      agent: agent._id,
      items: agentItems,
      assignedCount: agentItems.length
    });
    
    currentIndex += itemsForThisAgent;
  });
  
  return distributions;
};

// Upload and distribute CSV/Excel file
router.post('/upload', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a file'
      });
    }

    // Get all active agents
    const agents = await Agent.find({ isActive: true });
    if (agents.length === 0) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'No active agents found. Please add agents first.'
      });
    }

    let parsedData = [];
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    // Parse file based on extension
    if (fileExt === '.csv') {
      parsedData = await parseCSV(req.file.path);
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      parsedData = parseExcel(req.file.path);
    }

    if (parsedData.length === 0) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'No valid data found in file. Please ensure the file has FirstName, Phone, and Notes columns.'
      });
    }

    // Distribute items among agents
    const distributions = distributeItems(parsedData, agents);

    // Save to database
    const list = await List.create({
      fileName: req.file.originalname,
      totalItems: parsedData.length,
      uploadedBy: req.user._id,
      distributions: distributions
    });

    // Populate agent details
    await list.populate('distributions.agent', 'name email');

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.status(201).json({
      success: true,
      data: list
    });

  } catch (err) {
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: err.message || 'Server Error'
    });
  }
});

// Get all lists
router.get('/', protect, async (req, res) => {
  try {
    const lists = await List.find()
      .populate('uploadedBy', 'email')
      .populate('distributions.agent', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: lists.length,
      data: lists
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

// Get single list
router.get('/:id', protect, async (req, res) => {
  try {
    const list = await List.findById(req.params.id)
      .populate('uploadedBy', 'email')
      .populate('distributions.agent', 'name email');

    if (!list) {
      return res.status(404).json({
        success: false,
        message: 'List not found'
      });
    }

    res.status(200).json({
      success: true,
      data: list
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

module.exports = router;
