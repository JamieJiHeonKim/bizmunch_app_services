const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const restaurantSchema = new Schema(
    {
      restaurantId: { type: Number, index: 1 },
      name: { type: String, required: true, unique: true },
      location: { type: String, required: true },
      managerName: { type: String, required: true, unique: false },
      managerEmail: { type: String, required: true, unique: true },
      category: { type: String, required: true },
      logo: { type: String , required: true },
      menuId: {type: Schema.Types.ObjectId, ref: 'Menu'},
    },
    { timestamps: true },
  );

const Restaurant = mongoose.model('Restaurant', restaurantSchema);
module.exports = Restaurant;