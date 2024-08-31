const mongoose = require('mongoose');
const Restaurant = require('../models/restaurantModel');

const getRestaurants = async (req, res) => {
    try {
        const gfs = req.app.locals.gfs;
        if (!gfs) {
            // console.error('GridFS is not initialized');
            return res.status(500).json({ message: 'GridFS is not initialized' });
        }

        const restaurants = await Restaurant.find().select('name category logo barcode location');

        const restaurantsWithImages = await Promise.all(restaurants.map(async (restaurant) => {
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

            if (restaurant.barcode) {
                const logoFile = await gfs.find({ _id: new mongoose.Types.ObjectId(restaurant.barcode) }).toArray();
                if (!logoFile || logoFile.length === 0) {
                    throw new Error(`No file found for logo ID: ${restaurant.barcode}`);
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

                barcode = `data:image/png;base64,${buffer.toString('base64')}`;
            }

            return {
                _id: restaurant._id,
                name: restaurant.name,
                category: restaurant.category,
                location: restaurant.location,
                logo: logo,
                barcode: barcode
            };
        }));

        res.json(restaurantsWithImages);
    } catch (error) {
        // console.error('Error fetching restaurants:', error);
        res.status(500).json({ message: 'Failed to fetch restaurants' });
    }
};

module.exports = {
    getRestaurants,
};
