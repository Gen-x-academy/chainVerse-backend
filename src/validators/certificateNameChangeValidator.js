const Joi = require('joi');

exports.nameChangeRequestSchema = Joi.object({
  newFullName: Joi.string()
    .min(2)
    .max(100)
    .required()
    .trim()
    .pattern(/^[a-zA-Z\s'-]+$/)
    .messages({
      'string.base': 'New full name must be a string',
      'string.empty': 'New full name cannot be empty',
      'string.min': 'New full name must be at least 2 characters',
      'string.max': 'New full name cannot exceed 100 characters',
      'string.pattern.base': 'New full name can only contain letters, spaces, hyphens, and apostrophes',
      'any.required': 'New full name is required'
    }),
  reason: Joi.string()
    .min(10)
    .max(500)
    .required()
    .trim()
    .messages({
      'string.base': 'Reason must be a string',
      'string.empty': 'Reason cannot be empty',
      'string.min': 'Reason must be at least 10 characters',
      'string.max': 'Reason cannot exceed 500 characters',
      'any.required': 'Reason is required'
    }),
  certificateId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Certificate ID must be a valid MongoDB ObjectId'
    })
});

exports.statusFilterSchema = Joi.object({
  status: Joi.string()
    .valid('Pending', 'Approved', 'Rejected')
    .optional()
    .messages({
      'any.only': 'Status must be one of: Pending, Approved, Rejected'
    })
});
