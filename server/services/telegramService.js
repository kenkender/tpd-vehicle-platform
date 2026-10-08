const config = require('../config');

/**
 * ส่งข้อความหา Telegram Chat ID หรือ Group Chat ID
 * @param {string} chatId - Telegram Chat ID หรือ Group Chat ID
 * @param {string} message - ข้อความ (HTML format)
 */
async function sendNotification(chatId, message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId).trim(),
        text: message,
        parse_mode: 'HTML',
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn('[telegram bot error response]', txt);
    }
    return res.ok;
  } catch (e) {
    console.error('[telegram bot send error]', e.message);
    return false;
  }
}

/**
 * ฟอร์แมตข้อความแจ้งเตือนตามรูปแบบที่ผู้ใช้กำหนด
 */
function formatMessage(vehicle, statusText) {
  const plate = vehicle.plate_display || vehicle.plate_number || vehicle.plate_norm;
  const prov = vehicle.province || 'กรุงเทพมหานคร';
  const owner = vehicle.owner_name || 'ไม่ระบุ';
  const brand = vehicle.brand || '';
  const model = vehicle.model || '';
  const color = vehicle.color || '';
  const phone = vehicle.phone || vehicle.owner_phone || '-';

  let carInfo = `${brand} ${model}`.trim();
  if (color) carInfo += ` (สี${color})`;
  if (!carInfo) carInfo = 'ไม่ระบุ';

  return `📣 <b>แจ้งเตือนสถานะการลงทะเบียนยานพาหนะ</b>\n` +
    `กองบัญชาการตำรวจท่องเที่ยว (TPD Vehicle System)\n\n` +
    `🚗 <b>เลขทะเบียน:</b> ${plate} (${prov})\n` +
    `📌 <b>สถานะล่าสุด:</b> ${statusText}\n` +
    `👤 <b>ผู้ลงทะเบียน:</b> ${owner}\n` +
    `🚘 <b>รถยี่ห้อ/รุ่น/สี:</b> ${carInfo}\n` +
    `📞 <b>เบอร์โทร:</b> ${phone}\n` +
    (vehicle.note ? `📝 <b>หมายเหตุ:</b> ${vehicle.note}\n` : '') +
    `\nระบบแจ้งเตือนการลงทะเบียนอัตโนมัติ`;
}

/**
 * แจ้งเตือนเมื่อผู้ใช้ลงทะเบียนใหม่เข้ามา (รออนุมัติ)
 */
function notifyNewRegistration(vehicle) {
  if (!vehicle) return;
  const msg = formatMessage(vehicle, '🟡 รอผู้ดูแลระบบอนุมัติ');

  // 1. ส่งเข้ากลุ่ม Telegram รวม (ถ้าตั้งค่า TELEGRAM_GROUP_CHAT_ID ไว้)
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID || config.telegramGroupChatId;
  if (groupChatId) {
    sendNotification(groupChatId, msg);
  }

  // 2. ส่งหาผู้ใช้รายบุคคล (ถ้าผูก Telegram Chat ID ไว้)
  if (vehicle.telegram_chat_id && vehicle.telegram_chat_id !== groupChatId) {
    sendNotification(vehicle.telegram_chat_id, msg);
  }
}

/**
 * แจ้งเตือนเมื่อแอดมินเปลี่ยนสถานะ (อนุมัติ / ไม่อนุญาต)
 */
function notifyStatusChange(vehicle, status) {
  if (!vehicle) return;
  const statusText = status === 'allowed'
    ? '🟢 ได้รับการอนุมัติเรียบร้อยแล้ว'
    : status === 'blocked'
    ? '🔴 ไม่อนุญาต / บล็อก'
    : '🟡 รอผู้ดูแลระบบอนุมัติ';

  const msg = formatMessage(vehicle, statusText);

  // 1. ส่งเข้ากลุ่ม Telegram รวม
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID || config.telegramGroupChatId;
  if (groupChatId) {
    sendNotification(groupChatId, msg);
  }

  // 2. ส่งหาผู้ใช้รายบุคคล (ถ้าไม่ซ้ำกับ Group ID)
  if (vehicle.telegram_chat_id && vehicle.telegram_chat_id !== groupChatId) {
    sendNotification(vehicle.telegram_chat_id, msg);
  }
}

module.exports = { sendNotification, notifyNewRegistration, notifyStatusChange, formatMessage };
