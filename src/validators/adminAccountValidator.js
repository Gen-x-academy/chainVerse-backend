const Joi = require("joi");

const updateProfileSchema = Joi.object({
  fullName: Joi.string().min(3).trim(),
  email: Joi.string().email().trim(),
  phoneNumber: Joi.string()
    .min(10)
    .max(15)
    .pattern(/^[0-9+]+$/),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  // Enforce strong password: Min 8 chars, 1 letter, 1 number
  newPassword: Joi.string()
    .min(8)
    .pattern(new RegExp("^(?=.*[A-Za-z])(?=.*\\d)[A-Za-z\\d@$!%*#?&]{8,}$"))
    .required()
    .messages({
      "string.pattern.base":
        "Password must contain at least one letter and one number",
    }),
});

module.exports = {
  updateProfileSchema,
  changePasswordSchema,
};
