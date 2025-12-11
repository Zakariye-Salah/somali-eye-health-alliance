// models/OpportunityApplication.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const OpportunityApplicationSchema = new Schema({
  opportunityId: { type: String, index: true }, // may be the opportunity _id or slug or filename
  opportunityTitle: { type: String },

  // applicant fields
  name: { type: String, required: true, trim: true },     // normalized applicant name
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String },
  location: { type: String },
  type: { type: String },
  statement: { type: String },
  availableFrom: { type: String },

  // CV file metadata (optional)
  cvName: { type: String },
  cvUrl: { type: String }, // public URL (e.g. /uploads/opportunities/xxx.pdf)

  status: { type: String, enum: ['pending','reviewed','accepted','rejected'], default: 'pending' },
  ip: { type: String },
  meta: Schema.Types.Mixed,
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('OpportunityApplication', OpportunityApplicationSchema);
