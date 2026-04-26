const { readDB, writeDB } = require('../config/db');

async function getAvailableSlots() {
  const db = await readDB();
  return db.slots;
}

async function bookAppointment(phone, timeSlot) {
  const db = await readDB();
  
  if (!db.slots.includes(timeSlot)) {
    return { success: false, message: "Slot not available." };
  }

  // Remove slot from available slots
  db.slots = db.slots.filter(s => s !== timeSlot);
  
  // Add appointment
  db.appointments.push({
    phone,
    timeSlot,
    status: 'confirmed'
  });

  await writeDB(db);
  return { success: true, message: `Appointment booked successfully for ${timeSlot}.` };
}

module.exports = { getAvailableSlots, bookAppointment };
