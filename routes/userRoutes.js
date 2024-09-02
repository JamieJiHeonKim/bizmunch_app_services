const express = require('express');
const { body } = require('express-validator');
const AppUser = require('../models/userModel');
const router = express.Router();
const cron = require('node-cron');
const { userRegister, verifyEmail, forgotPassword, verifyForgotPassword, verifyUserExists, userLogIn, updateUserPassword, updateFavorites, updateRotation, getRotatedRestaurants, getPinnedRestaurants } = require('../controllers/userController');

router.post('/register', [
    body('email').isEmail().withMessage('Enter a valid email address'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
    body('firstName').not().isEmpty().trim().escape(),
    body('lastName').not().isEmpty().trim().escape(),
    body('company').not().isEmpty().trim().escape(),
    body('invitation').not().isEmpty().trim().escape()
], userRegister);

router.post('/forgot-password', forgotPassword);

router.post('/verify-forgot-password', verifyForgotPassword);

router.post('/verify-email', [
    body('userId').not().isEmpty().withMessage('User ID is required'),
    body('otp').not().isEmpty().withMessage('OTP is required')
], verifyEmail);

router.post('/verify-user', [
    body('userId').not().isEmpty().withMessage('User ID is required')
], verifyUserExists);

router.post('/auth', [
    body('email').isEmail().withMessage('Enter a valid email address'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
], userLogIn);

router.post('/update-password', [
    body('currentPassword').not().isEmpty(),
    body('newPassword').matches(/^(?=.*[!@#$%^&*]).{8,}$/).withMessage('Password must be at least 8 characters long and include at least one special character.')
], updateUserPassword);

router.post('/update-favorites', updateFavorites);

router.get('/rotated-restaurants/:userId', getRotatedRestaurants);

router.get('/get-pinned-restaurants/:userId', getPinnedRestaurants);

cron.schedule('0 0 * * 1', async () => {
    console.log('Running weekly rotation update');
    const users = await AppUser.find();
    users.forEach(user => {
        updateRotation(user._id);
    });
    console.log('Weekly rotation update done');
});

router.use((err, req, res, next) => {
    if (!err.statusCode) err.statusCode = 500;
    res.status(err.statusCode).send({ error: err.toString() });
});

module.exports = router;