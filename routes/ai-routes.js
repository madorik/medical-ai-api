const express = require('express');
const { askChatGPT, chatWithHistory, validateApiKey } = require('../services/openai-service');
const { optionalAuth, authenticateToken } = require('../utils/jwt-utils');

const router = express.Router();



module.exports = router; 