const express = require('express');
const { body, validationResult } = require('express-validator');
const Agent = require('../models/Agent');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Get all agents
router.get('/', protect, async (req, res) => {
  try {
    const agents = await Agent.find({ isActive: true }).select('-password');
    
    res.status(200).json({
      success: true,
      count: agents.length,
      data: agents
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

// Add new agent
router.post('/', protect, [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please include a valid email'),
  body('mobile').matches(/^\+[1-9]\d{1,14}$/).withMessage('Please add a valid mobile number with country code'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, mobile, password } = req.body;

    // Check if agent already exists
    let agent = await Agent.findOne({ email });
    if (agent) {
      return res.status(400).json({
        success: false,
        message: 'Agent with this email already exists'
      });
    }

    // Check if mobile number already exists
    agent = await Agent.findOne({ mobile });
    if (agent) {
      return res.status(400).json({
        success: false,
        message: 'Agent with this mobile number already exists'
      });
    }

    // Create agent
    agent = await Agent.create({
      name,
      email,
      mobile,
      password
    });

    res.status(201).json({
      success: true,
      data: {
        id: agent._id,
        name: agent.name,
        email: agent.email,
        mobile: agent.mobile,
        isActive: agent.isActive,
        createdAt: agent.createdAt
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

// Get single agent
router.get('/:id', protect, async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id).select('-password');
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    res.status(200).json({
      success: true,
      data: agent
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

// Update agent
router.put('/:id', protect, [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Please include a valid email'),
  body('mobile').optional().matches(/^\+[1-9]\d{1,14}$/).withMessage('Please add a valid mobile number with country code')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).select('-password');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    res.status(200).json({
      success: true,
      data: agent
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

module.exports = router;
