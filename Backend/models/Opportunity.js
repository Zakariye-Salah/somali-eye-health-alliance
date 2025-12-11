const mongoose = require('mongoose');
const { Schema } = mongoose;

const OpportunitySchema = new Schema({
  title: { type: String, required: true, trim: true },
  location: { type: String, trim: true },
  type: { type: String, trim: true }, // e.g. Volunteer, Internship, Part-time, Employment
  duration: { type: String, trim: true },
  stipend: { type: String, trim: true },
  excerpt: { type: String, trim: true },
  details: { type: String, trim: true },
  slug: { type: String, trim: true, index: true },
  detailPage: { type: String, trim: true }, // exact filename e.g. 'opportunity-detail-....html'
  meta: Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('Opportunity', OpportunitySchema);
