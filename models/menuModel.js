const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const menuItemSchema = new Schema({
    name: { type: String, required: true },
    price: { type: String, required: true },
    calories: { type: String },
    ingredients: { type: [String] },
    image: { type: String }
});

const menuSchema = new Schema({
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    menu: { 
        type: Map, 
        of: new Schema({
            price: { type: String, required: true },
            calories: { type: String },
            ingredients: { type: [String] }, 
        }), 
        default: {} 
    },
}, { timestamps: true });

const Menu = mongoose.model('Menu', menuSchema);
module.exports = Menu;
