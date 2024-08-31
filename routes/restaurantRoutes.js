const express = require('express');
const router = express.Router();
const { getRestaurants } = require('../controllers/restaurantController');
const { getMenu, createMenu } = require('../controllers/menuController');

router.get('/allrestaurants', getRestaurants);
router.get('/:id/menu', getMenu);
router.post('/createmenu', createMenu);

module.exports = router;
