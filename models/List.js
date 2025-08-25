const mongoose = require('mongoose');

const ListItemSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [
      /^\+?[\d\s\-\(\)]+$/,
      'Please add a valid phone number'
    ]
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  }
});

const ListSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: [true, 'File name is required']
  },
  totalItems: {
    type: Number,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  distributions: [{
    agent: {
      type: mongoose.Schema.ObjectId,
      ref: 'Agent',
      required: true
    },
    items: [ListItemSchema],
    assignedCount: {
      type: Number,
      required: true
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('List', ListSchema);
