const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const AppUser = require('../models/userModel');
const Company = require('../models/companyModel');
const Restaurant = require('../models/restaurantModel');
const VerificationToken = require('../models/VerificationToken');
const { sendError, generateOTP, mailTransport, generateEmailTemplate } = require('../utils/mail');

const generateAndSaveOTP = async (userId) => {
    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);

    const verificationToken = new VerificationToken({ owner: userId, token: hashedOtp });
    await verificationToken.save();

    return otp;
};

const userRegister = async (req, res) => {
    try {
        const { firstName, lastName, email, invitation, password } = req.body;
        
        const allRestaurants = await Restaurant.find();
        const shuffledRestaurants = allRestaurants.sort(() => 0.5 - Math.random());
        const selectedRestaurants = shuffledRestaurants.slice(0, 10).map(restaurant => ({
            restaurantId: restaurant._id,
            name: restaurant.name,
            category: restaurant.category,
            location: restaurant.location,
            logo: restaurant.logo,
            barcode: restaurant.barcode
        }));
        
        const existingUser = await AppUser.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: "User with this email already exists." });
        }

        const company = await Company.findOne({ invitationCode: invitation });
        if (!company) {
            return res.status(404).json({ message: "Invalid invitation code." });
        }

        const newUser = new AppUser({
            firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase(),
            lastName: lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase(),
            email,
            company,
            invitation,
            password: password,
            rotation: selectedRestaurants
        });

        const savedUser = await newUser.save();
        const otp = await generateAndSaveOTP(savedUser._id);

        mailTransport().sendMail({
            from: 'do_not_reply@bizmunch.com',
            to: savedUser.email,
            subject: 'Biz Munch - Verify Your Email Address',
            html: generateEmailTemplate(otp) // Sending the non-hashed OTP via email
        });

        res.status(201).json({
            message: "User registered successfully! Please check your email to verify your account.",
            user: savedUser,
        });
    } catch (error) {
        // console.error("Error during registration:", error);
        res.status(500).json({ message: "Internal server error during registration." });
    }
};

const verifyEmail = async (req, res) => {
    try {
        const { userId, otp } = req.body;
        const user = await AppUser.findById(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Find the verification token by user ID
        const token = await VerificationToken.findOne({ owner: user._id });
        if (!token) {
            return res.status(404).json({ error: 'Token not found.' });
        }

        // Compare OTP (using bcrypt's compare function)
        const isMatch = await bcrypt.compare(otp, token.token);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
        }

        // Mark user as verified and remove the expiration time
        user.verified = true;
        user.expireAt = undefined;
        await user.save();

        // Delete the verification token
        await VerificationToken.findByIdAndDelete(token._id);

        res.status(200).json({ message: 'Email verified successfully!' });
    } catch (error) {
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
};



const handleTokenExpiration = async (user, res) => {
    await AppUser.findByIdAndDelete(user._id);
    res.status(410).json({ message: "Verification time expired and user was deleted." });
};

const verifyUserExists = async (req, res) => {
    const { userId } = req.query;
    if (!userId) {
        return res.status(400).json({ message: "User ID is required." });
    }
    const user = await AppUser.findById(userId);
    if (!user) {
        return res.status(404).json({ exists: false });
    } else {
        return res.status(200).json({ exists: true, user: user });
    }
};

const userLogIn = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await AppUser.findOne({ email }).populate('company');
        if (!user) {
            return res.status(400).json({ message: "Login failed. Email does not exist." });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Login failed. Password does not match." });
        }
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1y' });

        // Fetch user's pinned restaurants
        const pinnedRestaurants = user.favorites || [];

        res.json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: `${user.firstName} ${user.lastName}`,
                email: user.email,
                company: user.company
            },
            pinnedRestaurants
        });
    } catch (err) {
        // console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

const getPinnedRestaurants = async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await AppUser.findById(userId).select('favorites');
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json(user.favorites);
    } catch (err) {
        // console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

const updateUserPassword = async (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;
    const user = await AppUser.findById(userId);

    if (!user) {
        return res.status(404).json({ error: true, message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
        return res.status(403).json({ error: true, message: 'Current password is incorrect.' });
    }

    if (currentPassword === newPassword) {
        return res.status(400).json({ error: true, message: 'New password must be different from the current password.' });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ error: false, message: 'Password updated successfully.' });
};

const updateFavorites = async (req, res) => {
    const { userId, restaurantIds } = req.body;

    if (!userId || !restaurantIds || !Array.isArray(restaurantIds)) {
        return res.status(400).json({ message: 'Invalid data provided.' });
    }

    try {
        const user = await AppUser.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        user.favorites = restaurantIds;
        await user.save();

        res.status(200).json({ message: 'Favorites updated successfully.', favorites: user.favorites });
    } catch (error) {
        // console.error('Error updating favorites:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};

const updateRotation = async (userId) => {
    try {
        const user = await AppUser.findById(userId);
        if (!user) {
            // console.error('User not found.');
            return;
        }

        const allRestaurants = await Restaurant.find();

        const selectedFavorites = user.favorites.map(favorite => {
            const restaurant = allRestaurants.find(rest => rest._id.equals(favorite));
            if (restaurant) {
                return {
                    restaurantId: restaurant._id,
                    name: restaurant.name,
                    category: restaurant.category,
                    location: restaurant.location,
                    logo: restaurant.logo,
                    barcode: restaurant.barcode
                };
            } else {
                // console.error(`Favorite restaurant not found: ${favorite}`);
                return null;
            }
        }).filter(item => item !== null);

        const remainingRestaurants = allRestaurants.filter(rest => !user.favorites.includes(rest._id));

        const shuffledRestaurants = remainingRestaurants.sort(() => 0.5 - Math.random());
        const remainingSlots = 10 - selectedFavorites.length;
        const selectedRestaurants = shuffledRestaurants.slice(0, remainingSlots).map(restaurant => ({
            restaurantId: restaurant._id,
            name: restaurant.name,
            category: restaurant.category,
            location: restaurant.location,
            logo: restaurant.logo,
            barcode: restaurant.barcode
        }));

        // Combine favorites and randomly selected restaurants
        user.rotation = [...selectedFavorites, ...selectedRestaurants];
        
        await user.save();
        console.log(`Rotation updated successfully for user: ${userId}`);
    } catch (error) {
        // console.error('Error updating rotation:', error);
        return;
    }
};

const getRotatedRestaurants = async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await AppUser.findById(userId).populate('rotation.restaurantId');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const gfs = req.app.locals.gfs;
        if (!gfs) {
            // console.error('GridFS is not initialized');
            return res.status(500).json({ message: 'GridFS is not initialized' });
        }

        const restaurantsWithImages = await Promise.all(user.rotation.map(async (restaurant) => {
            let logo = null;
            if (restaurant.logo) {
                const logoFile = await gfs.find({ _id: new mongoose.Types.ObjectId(restaurant.logo) }).toArray();
                if (!logoFile || logoFile.length === 0) {
                    throw new Error(`No file found for logo ID: ${restaurant.logo}`);
                }

                const readStream = gfs.openDownloadStream(logoFile[0]._id);
                const chunks = [];

                readStream.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                const buffer = await new Promise((resolve, reject) => {
                    readStream.on('end', () => {
                        resolve(Buffer.concat(chunks));
                    });

                    readStream.on('error', (err) => {
                        reject(err);
                    });
                });

                logo = `data:image/png;base64,${buffer.toString('base64')}`;
            }

            let barcode = null;
            if (restaurant.barcode) {
                const barcodeFile = await gfs.find({ _id: new mongoose.Types.ObjectId(restaurant.barcode) }).toArray();
                if (!barcodeFile || barcodeFile.length === 0) {
                    throw new Error(`No file found for barcode ID: ${restaurant.barcode}`);
                }

                const readStream = gfs.openDownloadStream(barcodeFile[0]._id);
                const chunks = [];

                readStream.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                const buffer = await new Promise((resolve, reject) => {
                    readStream.on('end', () => {
                        resolve(Buffer.concat(chunks));
                    });

                    readStream.on('error', (err) => {
                        reject(err);
                    });
                });

                barcode = `data:image/png;base64,${buffer.toString('base64')}`;
            }

            return {
                _id: restaurant.restaurantId._id,
                name: restaurant.name,
                category: restaurant.category,
                location: restaurant.location,
                logo: logo,
                barcode: barcode
            };
        }));

        res.json(restaurantsWithImages);
    } catch (error) {
        // console.error('Error fetching rotated restaurants:', error);
        res.status(500).json({ message: 'Failed to fetch rotated restaurants' });
    }
};

module.exports = {
    userRegister,
    verifyEmail,
    verifyUserExists,
    handleTokenExpiration,
    userLogIn,
    updateUserPassword,
    updateFavorites,
    updateRotation,
    getRotatedRestaurants,
    getPinnedRestaurants
};
