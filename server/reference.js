/**
 * ข้อมูลอ้างอิงที่ใช้ร่วมกันทั้ง backend (validate) และ frontend (ตัวเลือกในฟอร์ม)
 */

const PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา',
  'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก',
  'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน',
  'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา',
  'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต',
  'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี',
  'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
  'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี',
  'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี',
  'อุบลราชธานี',
];

const PLATE_TYPES = [
  { value: 'white_black', label: 'ป้ายขาว ตัวหนังสือดำ', hint: 'รถยนต์นั่งส่วนบุคคล ไม่เกิน 7 ที่นั่ง' },
  { value: 'white_green', label: 'ป้ายขาว ตัวหนังสือเขียว', hint: 'รถกระบะ / บรรทุกส่วนบุคคล' },
  { value: 'white_blue', label: 'ป้ายขาว ตัวหนังสือฟ้า', hint: 'รถยนต์นั่งเกิน 7 ที่นั่ง / รถตู้' },
  { value: 'yellow', label: 'ป้ายเหลือง', hint: 'รถรับจ้าง / สาธารณะ' },
  { value: 'motorcycle', label: 'ป้ายมอเตอร์ไซค์', hint: 'รถจักรยานยนต์' },
  { value: 'special', label: 'ป้ายประมูล / ป้ายแดง / ป้ายทูต', hint: 'ป้ายพิเศษ' },
];

const BODY_TYPES = [
  { value: 'sedan', label: 'รถเก๋ง (Sedan)' },
  { value: 'suv', label: 'SUV / PPV' },
  { value: 'pickup', label: 'รถกระบะ (Pickup)' },
  { value: 'van', label: 'รถตู้ (Van)' },
  { value: 'motorcycle', label: 'จักรยานยนต์' },
  { value: 'truck', label: 'รถบรรทุก' },
  { value: 'other', label: 'อื่น ๆ' },
];

const COLORS = [
  'ขาว', 'ดำ', 'เทา', 'บรอนซ์เงิน', 'เงิน', 'แดง', 'น้ำเงิน', 'ฟ้า', 'เขียว', 'เหลือง', 'ส้ม',
  'น้ำตาล', 'บรอนซ์ทอง', 'ทอง', 'ชมพู', 'ม่วง', 'ครีม', 'หลายสี',
];

const MEMBER_TYPES = [
  { value: 'official', label: 'ข้าราชการ', publicSelectable: true },
  { value: 'staff', label: 'พนักงาน / ลูกจ้าง', publicSelectable: true },
  { value: 'visitor', label: 'ผู้มาติดต่อ (Visitor)', publicSelectable: true },
  { value: 'blacklist', label: 'Blacklist', publicSelectable: false },
];

// สถานะ -> ค่าใน Excel ของ Hikvision (คอลัมน์ "Belong to")
const STATUSES = {
  pending: { label: 'รออนุมัติ', excel: null },
  allowed: { label: 'อนุญาต', excel: 'Allowlist' },
  blocked: { label: 'ไม่อนุญาต', excel: 'Blocklist' },
};

const BRANDS = {
  Toyota: ['Yaris', 'Yaris Ativ', 'Vios', 'Corolla Altis', 'Corolla Cross', 'Camry', 'C-HR', 'Fortuner', 'Hilux Revo', 'Hilux Champ', 'Innova', 'Veloz', 'Avanza', 'Alphard', 'Commuter', 'bZ4X'],
  Honda: ['City', 'Civic', 'Accord', 'Jazz', 'Brio', 'HR-V', 'CR-V', 'BR-V', 'WR-V', 'Wave', 'Click', 'PCX', 'Scoopy', 'Forza', 'ADV'],
  Isuzu: ['D-Max', 'MU-X', 'Elf', 'Giga'],
  Mitsubishi: ['Triton', 'Pajero Sport', 'Xpander', 'Attrage', 'Mirage', 'Outlander'],
  Nissan: ['Almera', 'Kicks', 'Navara', 'Terra', 'Note', 'Teana', 'X-Trail', 'Leaf'],
  Mazda: ['Mazda2', 'Mazda3', 'CX-3', 'CX-30', 'CX-5', 'CX-8', 'BT-50'],
  Ford: ['Ranger', 'Everest', 'Territory', 'Focus', 'Fiesta'],
  Suzuki: ['Swift', 'Ciaz', 'Ertiga', 'Celerio', 'XL7', 'Carry'],
  MG: ['MG3', 'MG4', 'MG5', 'ZS', 'HS', 'Extender', 'MG7', 'Maxus 9'],
  BYD: ['Atto 3', 'Dolphin', 'Seal', 'Sealion 6', 'Sealion 7', 'M6', 'Seagull', 'Han'],
  GWM: ['Ora Good Cat', 'Haval H6', 'Haval Jolion', 'Tank 300', 'Poer'],
  Chevrolet: ['Colorado', 'Trailblazer', 'Captiva', 'Cruze', 'Sonic'],
  Hyundai: ['Staria', 'H-1', 'Creta', 'Ioniq 5', 'Tucson', 'Stargazer'],
  Kia: ['Seltos', 'Sportage', 'Carnival', 'EV6', 'Sorento'],
  Subaru: ['XV', 'Forester', 'Crosstrek', 'BRZ'],
  'Mercedes-Benz': ['C-Class', 'E-Class', 'S-Class', 'GLC', 'GLE', 'A-Class', 'V-Class'],
  BMW: ['Series 3', 'Series 5', 'X1', 'X3', 'X5', 'iX3'],
  Volvo: ['XC40', 'XC60', 'XC90', 'S90', 'EX30'],
  Lexus: ['ES', 'NX', 'RX', 'LM', 'UX'],
  Tesla: ['Model 3', 'Model Y'],
  Neta: ['V', 'V-II', 'X'],
  Changan: ['Deepal S07', 'Deepal L07', 'UNI-T'],
  Zeekr: ['001', 'X'],
  AION: ['Y Plus', 'ES', 'V'],
  Yamaha: ['NMAX', 'Aerox', 'Grand Filano', 'Fino', 'Mio', 'XSR155', 'MT-15', 'R15'],
  Kawasaki: ['Ninja 400', 'Z400', 'W175', 'Versys'],
  GPX: ['Demon', 'Legend', 'Drone'],
  Vespa: ['Primavera', 'Sprint', 'GTS'],
  'Harley-Davidson': ['Sportster', 'Street Glide', 'Fat Boy'],
  Hino: ['300', '500'],
  Fuso: ['Canter', 'Fighter'],
};

module.exports = {
  PROVINCES, PLATE_TYPES, BODY_TYPES, COLORS, MEMBER_TYPES, STATUSES, BRANDS,
  PLATE_TYPE_VALUES: PLATE_TYPES.map((p) => p.value),
  BODY_TYPE_VALUES: BODY_TYPES.map((b) => b.value),
  MEMBER_TYPE_VALUES: MEMBER_TYPES.map((m) => m.value),
  PUBLIC_MEMBER_TYPE_VALUES: MEMBER_TYPES.filter((m) => m.publicSelectable).map((m) => m.value),
};
