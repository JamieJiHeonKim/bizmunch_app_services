const mongoose = require('mongoose');
const Menu = require('../models/menuModel');

const getMenu = async (req, res) => {
    try {
        const gfs = req.app.locals.gfs;
        if (!gfs) {
            return res.status(500).json({ message: 'GridFS is not initialized' });
        }

        const menus = await Menu.find({ restaurantId: req.params.id });

        const menusWithFiles = await Promise.all(menus.map(async (menu) => {
            for (let category in menu.menu) {
                const items = Object.entries(menu.menu[category]);

                for (const [key, item] of items) {
                    if (item.barcode) {
                        const barcodeFile = await gfs.find({ _id: new mongoose.Types.ObjectId(item.barcode) }).toArray();
                        if (!barcodeFile || barcodeFile.length === 0) {
                            throw new Error(`No file found for barcode ID: ${item.barcode}`);
                        }

                        const barcodeStream = gfs.openDownloadStream(barcodeFile[0]._id);
                        const barcodeChunks = [];

                        barcodeStream.on('data', (chunk) => {
                            barcodeChunks.push(chunk);
                        });

                        const barcodeBuffer = await new Promise((resolve, reject) => {
                            barcodeStream.on('end', () => {
                                resolve(Buffer.concat(barcodeChunks));
                            });

                            barcodeStream.on('error', (err) => {
                                reject(err);
                            });
                        });

                        item.barcode = `data:image/png;base64,${barcodeBuffer.toString('base64')}`;
                    }

                    if (item.image) {
                        const imageFile = await gfs.find({ _id: new mongoose.Types.ObjectId(item.image) }).toArray();
                        if (!imageFile || imageFile.length === 0) {
                            throw new Error(`No file found for image ID: ${item.image}`);
                        }

                        const imageStream = gfs.openDownloadStream(imageFile[0]._id);
                        const imageChunks = [];

                        imageStream.on('data', (chunk) => {
                            imageChunks.push(chunk);
                        });

                        const imageBuffer = await new Promise((resolve, reject) => {
                            imageStream.on('end', () => {
                                resolve(Buffer.concat(imageChunks));
                            });

                            imageStream.on('error', (err) => {
                                reject(err);
                            });
                        });

                        item.image = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                    }
                }
            }
            return menu;
        }));

        res.json(menusWithFiles[0]);
    } catch (error) {
        console.error('Error fetching menu:', error);
        res.status(500).json({ message: 'Failed to fetch menu' });
    }
};

const createMenu = async (req, res) => {
    try {
        const { restaurantId, items } = req.body;
        if (!restaurantId || !items) {
            return res.status(400).json({ message: 'Restaurant ID and items are required' });
        }

        const newMenu = new Menu({
            restaurantId: mongoose.Types.ObjectId(restaurantId),
            items
        });

        const savedMenu = await newMenu.save();
        res.status(201).json(savedMenu);
    } catch (error) {
        // console.error('Error creating menu:', error);
        res.status(500).json({ message: 'Failed to create menu' });
    }
};

module.exports = {
    getMenu,
    createMenu
};
