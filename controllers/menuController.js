const mongoose = require('mongoose');
const Menu = require('../models/menuModel');

const getMenu = async (req, res) => {
    try {
        const restaurantId = req.params.id;

        const menu = await Menu.findOne({ restaurantId: new mongoose.Types.ObjectId(restaurantId) });

        if (!menu) {
            return res.status(404).json({ message: 'There is no menu available for this restaurant.' });
        }

        res.json(menu);
    } catch (error) {
        // console.error('Error fetching menu:', error);
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
