const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const restaurantSchema = new Schema({
    name: { type: String, required: true },
    location: { type: String, required: true },
    managerName: { type: String },
    managerEmail: { type: String },
    category: { type: String, required: true },
    logo: { type: String },
    barcode: { type: String, required: true },
    menuId: { type: Schema.Types.ObjectId, ref: 'Menu' }
}, { timestamps: true });

const Restaurant = mongoose.model('Restaurant', restaurantSchema);
module.exports = Restaurant;
