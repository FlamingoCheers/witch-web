// ===== 占卜引擎集（与安卓 skills/ 同源移植）=====
import C from './data/constants.js';
import TAROT_DATA from './data/tarot.js';
import LENORMAND_DATA from './data/lenormand.js';
import WEST from './data/western.js';
import LY64 from './data/liuyao64.js';

const {
  HEAVENLY_STEMS, EARTHLY_BRANCHES, BRANCHES_WUXING, WUXING_SHENG, WUXING_KE,
  BAGUA, HEXAGRAMS, LIUQIN, LIUSHEN, SHICHEN_HOURS,
} = C;

// ===== 通用工具 =====
export function getRandomSeed(question, timestamp) {
  const ts = timestamp || new Date().toISOString();
  const base = Date.parse(ts) || Date.now();
  let q = question.length * 1000;
  for (const c of question) q += c.codePointAt(0);
  return (base + q) >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const norm360 = (x) => ((x % 360) + 360) % 360;
const atan2d = (y, x) => norm360(deg(Math.atan2(y, x)));

// 时辰索引：0=早子时(00-01)…12=晚子时(23-24)，与安卓 hour_to_time_index 一致
export function hourToTimeIndex(hour) {
  return hour === 23 ? 12 : Math.floor((hour + 1) / 2);
}

export function hourBranchIndex(hour) {
  return Math.floor(((hour + 1) % 24) / 2); // 0=子…11=亥
}

const YAO_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

function wxRelation(meWx, otherWx) {
  if (meWx === otherWx) return '比和';
  if (WUXING_SHENG[otherWx] === meWx) return '生扶';
  if (WUXING_KE[otherWx] === meWx) return '克制';
  if (WUXING_SHENG[meWx] === otherWx) return '泄气';
  return '耗损';
}

// 六亲：以宫五行为我
function liuqinOf(gongWx, yaoWx) {
  if (gongWx === yaoWx) return '兄弟';
  if (WUXING_SHENG[gongWx] === yaoWx) return '子孙';   // 我生
  if (WUXING_KE[gongWx] === yaoWx) return '妻财';      // 我克
  if (WUXING_SHENG[yaoWx] === gongWx) return '父母';   // 生我
  return '官鬼';                                        // 克我
}

// ===== 紫微斗数 =====
import { astro } from '../vendor/iztro.mjs';

const PALACE_MEANINGS = {
  命宫: '个人性格、外在表现、一生格局', 兄弟宫: '兄弟姐妹关系、同辈人际', 夫妻宫: '婚姻感情、伴侣关系',
  子女宫: '子女缘分、生育、晚辈关系', 财帛宫: '财运、理财方式、收入来源', 疾厄宫: '健康状况、体质弱点',
  迁移宫: '外出运、社会活动、环境变化', 交友宫: '朋友关系、社交能力', 官禄宫: '职业发展、工作类型、成就',
  田宅宫: '不动产、家庭环境、居住条件', 福德宫: '精神状态、内心世界、福气', 父母宫: '父母关系、长辈缘分、教育背景',
};
const STANDARD_ORDER = ['命宫', '兄弟宫', '夫妻宫', '子女宫', '财帛宫', '疾厄宫', '迁移宫', '交友宫', '官禄宫', '田宅宫', '福德宫', '父母宫'];
const HARSH_STARS = ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫'];
const LUCKY_STARS = ['文昌', '文曲', '左辅', '右弼', '天魁', '天钺'];

const fmtStar = (s) => (s.brightness ? `${s.name}(${s.brightness})` : s.name);

function ziweiExecute(p) {
  const gender = p.gender === 'male' || p.gender === '男' ? '男' : '女';
  const timeIndex = hourToTimeIndex(Number(p.birth_hour));
  const chart = astro.bySolar(`${p.birth_year}-${p.birth_month}-${p.birth_day}`, timeIndex, gender, true, 'zh-CN');
  const palaces = chart.palaces;
  const byName = {};
  palaces.forEach((x) => { byName[x.name] = x; });
  const bodyPalace = palaces.find((x) => x.isBodyPalace);
  const d = chart;

  const lines = [];
  lines.push('═══ 紫微斗数排盘结果 ═══');
  lines.push(`公历: ${d.solarDate} | 农历: ${d.lunarDate}`);
  lines.push(`干支(农历纪年): ${d.chineseDate} | 时辰: ${d.time} (${d.timeRange})`);
  lines.push(`命宫在: ${d.earthlyBranchOfSoulPalace} | 身宫在: ${d.earthlyBranchOfBodyPalace}（落${bodyPalace?.name ?? '?'}）`);
  lines.push(`五行局: ${d.fiveElementsClass} | 命主: ${d.soul} | 身主: ${d.body} | 生肖: ${d.zodiac} | 星座: ${d.sign}`);
  lines.push('');

  const sihua = {};
  for (const pn of STANDARD_ORDER) {
    const pal = byName[pn];
    if (!pal) continue;
    const markers = [];
    if (pn === '命宫') markers.push('命');
    if (pal.isBodyPalace) markers.push('身');
    const mk = markers.length ? `[${markers.join('|')}]` : '';
    const majors = pal.majorStars.map(fmtStar).join(', ') || '无主星(借对宫)';
    const parts = [`  ${pn}(${pal.heavenlyStem}${pal.earthlyBranch})${mk}: ${majors}`];
    if (pal.minorStars?.length) parts.push(`辅星: ${pal.minorStars.map(fmtStar).join(', ')}`);
    if (pal.adjectiveStars?.length) parts.push(`杂曜: ${pal.adjectiveStars.map((s) => s.name).join(', ')}`);
    const sh = [];
    for (const s of [...(pal.majorStars || []), ...(pal.minorStars || [])]) {
      if (s.mutagen) {
        sh.push(`${s.name}化${s.mutagen}`);
        (sihua[s.mutagen] = sihua[s.mutagen] || []).push([s.name, pn]);
      }
    }
    if (sh.length) parts.push(`四化: ${sh.join(', ')}`);
    lines.push(parts.join(' | '));
    lines.push(`    └ ${PALACE_MEANINGS[pn] || ''}`);
  }
  if (Object.keys(sihua).length) {
    lines.push('');
    lines.push('四化总表: ' + Object.entries(sihua).map(([k, v]) => `化${k}: ${v.map(([s, p]) => `${s}(${p})`).join(', ')}`).join('；'));
  }
  if (p.question) lines.push(`\n═══ 专题: ${p.question} ═══`);

  const ming = byName['命宫'];
  const keyFindings = [
    `命宫在${d.earthlyBranchOfSoulPalace}，主星: ${ming?.majorStars.map(fmtStar).join(', ') || '无主星(借对宫)'}`,
    `身宫落${bodyPalace?.name}，后天发力点在${PALACE_MEANINGS[bodyPalace?.name] || ''}`,
  ];
  const career = byName['官禄宫'], wealth = byName['财帛宫'];
  if (career) keyFindings.push(`官禄宫主星: ${career.majorStars.map(fmtStar).join(', ') || '无主星'}`);
  if (wealth) keyFindings.push(`财帛宫主星: ${wealth.majorStars.map(fmtStar).join(', ') || '无主星'}`);
  if (sihua['忌']) keyFindings.push(`生年忌: ${sihua['忌'].map(([s, p]) => `${s}(${p})`).join(', ')}——该领域是一生执念与课题所在`);

  const warnings = [];
  for (const pn of ['疾厄宫', '夫妻宫']) {
    const pal = byName[pn];
    const harsh = (pal?.minorStars || []).filter((s) => HARSH_STARS.includes(s.name)).map((s) => s.name);
    if (harsh.length) warnings.push(`${pn}有煞星(${harsh.join(', ')})，该领域需多留意`);
  }
  if (sihua['忌']) for (const [s, pn] of sihua['忌']) warnings.push(`${s}化忌在${pn}，${PALACE_MEANINGS[pn] || ''}方面易有执念与反复`);

  const opportunities = [];
  for (const pn of ['官禄宫', '财帛宫', '命宫']) {
    const pal = byName[pn];
    const lucky = (pal?.minorStars || []).filter((s) => LUCKY_STARS.includes(s.name)).map((s) => s.name);
    if (lucky.length) opportunities.push(`${pn}有吉星(${lucky.join(', ')})加持，该领域有先天优势`);
  }
  if (sihua['禄']) for (const [s, pn] of sihua['禄']) opportunities.push(`${s}化禄在${pn}，${PALACE_MEANINGS[pn] || ''}是天然的顺风口`);

  return {
    skill_name: '紫微斗数',
    raw_data: {
      solar_date: d.solarDate, lunar_date: d.lunarDate, chinese_date: d.chineseDate,
      ming_gong_branch: d.earthlyBranchOfSoulPalace, shen_gong_branch: d.earthlyBranchOfBodyPalace,
      body_palace: bodyPalace?.name, wuxing_jv: d.fiveElementsClass,
      soul_star: d.soul, body_star: d.body, sihua: Object.fromEntries(Object.entries(sihua).map(([k, v]) => [k, v.map(([s, p]) => `${s}(${p})`)])),
      palaces: palaces.map((x) => ({ name: x.name, major: x.majorStars.map((s) => s.name), is_body: !!x.isBodyPalace })),
    },
    structured_output: lines.join('\n'),
    key_findings: keyFindings, warnings,
    opportunities,
    action_suggestions: [
      '紫微斗数呈现的是先天能量配置，后天努力和心态可以弥补不足',
      '重点关注命宫、身宫与官禄宫/财帛宫等关键宫位的配置',
      '化忌所在宫位是一生课题，宜主动经营而非回避',
    ],
  };
}

// ===== 西方占星 =====
function westernExecute(p) {
  const A = window.Astronomy;
  const y = +p.birth_year, mo = +p.birth_month, da = +p.birth_day;
  const h = p.birth_hour != null ? +p.birth_hour : 12, mi = +(p.birth_minute || 0);
  const lat = p.latitude != null ? +p.latitude : 39.9042;
  const lon = p.longitude != null ? +p.longitude : 116.4074;
  const tz = p.timezone_offset != null ? +p.timezone_offset : 8;
  const utc = new Date(Date.UTC(y, mo - 1, da, h, mi, 0) - tz * 3600000);

  const bodies = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  const eclip = {};
  for (let i = 0; i < bodies.length; i++) {
    const vec = A.GeoVector(A.Body[bodies[i]], utc, true);
    eclip[i] = norm360(A.Ecliptic(vec).elon);
  }

  const eps = A.e_tilt(utc).tobl;             // 真黄赤交角（已是度）
  const gast = A.SiderealTime(utc);           // hours
  const lst = norm360(gast * 15 + lon);        // RAMC (deg)
  const mc = atan2d(Math.sin(rad(lst)), Math.cos(rad(lst)) * Math.cos(rad(eps)));
  const asc = atan2d(-Math.cos(rad(lst)), Math.sin(rad(lst)) * Math.cos(rad(eps)) + Math.tan(rad(lat)) * Math.sin(rad(eps)));

  const signOf = (l) => {
    const idx = Math.floor(norm360(l) / 30);
    const s = WEST.ZODIAC_SIGNS[idx];
    return { idx, name: s.name, symbol: s.symbol, element: s.element, modality: s.modality, degree: +(norm360(l) % 30).toFixed(2) };
  };
  const houseOf = (l) => Math.floor((norm360(l - asc)) / 30) + 1;

  const lines = [];
  lines.push('═══ 西方占星排盘结果（天文级精度计算）═══');
  const sun = signOf(eclip[0]), moon = signOf(eclip[1]), ascS = signOf(asc), mcS = signOf(mc);
  lines.push(`☉ 太阳星座: ${sun.name} ${sun.symbol} ${sun.degree}° (${sun.element}象/${sun.modality})`);
  lines.push(`☽ 月亮星座: ${moon.name} ${moon.symbol} ${moon.degree}° (${moon.element}象/${moon.modality})`);
  lines.push(`↑ 上升星座: ${ascS.name} ${ascS.symbol} ${ascS.degree}° (${ascS.element}象/${ascS.modality})`);
  lines.push(`⊕ 天顶(MC): ${mcS.name} ${mcS.degree}°`);
  lines.push('');
  lines.push('═══ 行星落座（精确黄道经度）═══');
  const planetPos = [];
  for (let i = 0; i < bodies.length; i++) {
    const meta = WEST.PLANETS[i] || { name: bodies[i], symbol: '·' };
    const s = signOf(eclip[i]);
    planetPos.push({ planet: meta.name, sign: s.name, degree: s.degree, lon: +eclip[i].toFixed(2), house: houseOf(eclip[i]), element: s.element });
    lines.push(`  ${meta.symbol} ${meta.name}: ${s.name} ${s.degree}° (${s.element}) [第${houseOf(eclip[i])}宫]`);
  }
  // 相位
  lines.push('');
  lines.push('═══ 主要相位 ═══');
  const aspOut = [];
  for (let i = 0; i < planetPos.length; i++) {
    for (let j = i + 1; j < planetPos.length; j++) {
      let dlt = Math.abs(planetPos[i].lon - planetPos[j].lon);
      if (dlt > 180) dlt = 360 - dlt;
      for (const a of WEST.ASPECTS) {
        if (Math.abs(dlt - a.angle) <= a.orb) {
          aspOut.push(`${planetPos[i].planet}${a.name}${planetPos[j].planet}（容许度${Math.abs(dlt - a.angle).toFixed(1)}°）`);
          lines.push(`  ${planetPos[i].planet} ${a.name} ${planetPos[j].planet}`);
          break;
        }
      }
    }
  }
  if (!aspOut.length) lines.push('  （无主要相位）');
  // 元素分布
  const elemCount = { 火: 0, 土: 0, 风: 0, 水: 0 };
  planetPos.forEach((p) => { elemCount[p.element] = (elemCount[p.element] || 0) + 1; });
  lines.push('');
  lines.push('═══ 元素分布 ═══');
  lines.push(`  火 ${elemCount.火} | 土 ${elemCount.土} | 风 ${elemCount.风} | 水 ${elemCount.水}`);
  const dominant = Object.entries(elemCount).sort((a, b) => b[1] - a[1])[0];
  lines.push(`  主导元素: ${dominant[0]}（${dominant[1]}颗行星）`);
  if (p.question) lines.push(`\n═══ 专题: ${p.question} ═══`);

  const keyFindings = [
    `太阳${sun.name}（核心自我）、月亮${moon.name}（内在情绪）、上升${ascS.name}（人格面具）`,
    `主导元素是${dominant[0]}` + (dominant[0] === '火' ? '——行动力与热情驱动' : dominant[0] === '土' ? '——务实与稳扎稳打' : dominant[0] === '风' ? '——理性与信息驱动' : '——感受与直觉驱动'),
  ];
  if (aspOut.length) keyFindings.push(`共${aspOut.length}组主要相位，其中${aspOut[0]}`);
  const hardAsp = aspOut.filter((x) => x.includes('刑') || x.includes('冲'));
  if (hardAsp.length) warningsPush(hardAsp.length + '组刑冲相位，张力即动力，注意张弛有度');

  function warningsPush(t) { keyFindings.push('提示: ' + t); }
  const warnings = hardAsp.length ? [`${hardAsp.length}组刑/冲相位——压力位即是成长位，别硬扛`] : [];
  const opportunities = [`上升${ascS.name}的人生课题是「${ascS.name}式活法」，越早活出来越顺`];

  return {
    skill_name: '西方占星',
    raw_data: {
      sun_sign: sun.name, moon_sign: moon.name, rising_sign: ascS.name, mc_sign: mcS.name,
      planets: planetPos, aspects: aspOut, elements: elemCount,
      birth_utc: utc.toISOString(), latitude: lat, longitude: lon, timezone_offset: tz,
    },
    structured_output: lines.join('\n'),
    key_findings: keyFindings.slice(0, 4), warnings, opportunities,
    action_suggestions: [
      '星盘描述的是先天倾向与当下行运，不是宿命剧本',
      '上升星座的课题往往在中年后越来越重要，值得主动修炼',
      '想看具体领域（事业/感情/财运）可以继续追问',
    ],
  };
}

// ===== 六爻 =====
function liuyaoExecute(p) {
  const rnd = mulberry32(getRandomSeed(p.question, p.timestamp));
  const castCoins = () => Array.from({ length: 6 }, () => {
    let s = 0;
    for (let k = 0; k < 3; k++) s += rnd() < 0.5 ? 2 : 3;
    return s;
  });
  const lines6 = p.method === 'manual'
    ? p.manual_lines.map(Number)
    : castCoins();

  // 本卦 bits: bit i = 第i爻(初->上), 1=阳
  let bits = 0;
  lines6.forEach((v, i) => { if (v === 7 || v === 9) bits |= (1 << i); });
  const ben = LY64[String(bits)];
  const moving = lines6.map((v, i) => (v === 6 || v === 9 ? i : -1)).filter((i) => i >= 0);
  let bianBits = bits;
  moving.forEach((i) => { bianBits ^= (1 << i); });
  const bian = moving.length ? LY64[String(bianBits)] : null;

  // 时间与四柱
  let dt;
  try { dt = p.timestamp ? new Date(p.timestamp) : new Date(); } catch { dt = new Date(); }
  if (isNaN(dt)) dt = new Date();
  const lunar = window.Lunar.fromDate(dt);
  const gz = {
    year: lunar.getYearInGanZhi(), month: lunar.getMonthInGanZhi(),
    day: lunar.getDayInGanZhi(),
    hour: (() => {
      const bIdx = hourBranchIndex(dt.getHours());
      const dStem = HEAVENLY_STEMS.indexOf(gzDayStem(lunar));
      const stem = HEAVENLY_STEMS[(dStem % 5) * 2 + bIdx] ?? '甲';
      return stem + EARTHLY_BRANCHES[bIdx];
    })(),
  };
  // 旬空（从日柱推）
  const dayStemIdx = HEAVENLY_STEMS.indexOf(gz.day[0]);
  const dayBranchIdx = EARTHLY_BRANCHES.indexOf(gz.day[1]);
  let sixty = dayStemIdx;
  for (let k = 0; k < 12; k++) { if (sixty % 12 === dayBranchIdx) break; sixty += 10; }
  sixty %= 60;
  const xunStart = sixty - (sixty % 10);
  const kong = [EARTHLY_BRANCHES[(xunStart + 10) % 12], EARTHLY_BRANCHES[(xunStart + 11) % 12]].join('');
  // 六神：日干起青龙
  const liushenStart = { 甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5 }[gz.day[0]] ?? 0;
  const god6 = Array.from({ length: 6 }, (_, i) => LIUSHEN[(liushenStart + i) % 6]);

  const gongChar = ben.gong;
  const gongFull = gongChar + '宫';
  const gongWx = { 乾: '金', 兑: '金', 离: '火', 震: '木', 巽: '木', 坎: '水', 艮: '土', 坤: '土' }[gongChar] || '';
  const hide = ben.hide;

  const installed = ben.qinx.map((qinx, i) => {
    const branch = qinx[1], wx = qinx[2];
    return {
      position: i, name: YAO_NAMES[i], value: lines6[i],
      is_yang: lines6[i] === 7 || lines6[i] === 9,
      is_changing: moving.includes(i),
      liushen: god6[i], liuqin: ben.qin6[i], ganzhi: qinx, branch, wuxing: wx,
      shi: i === ben.shi, ying: i === ben.ying,
      kongwang: kong.includes(branch),
      hidden: hide && hide.seat.includes(i)
        ? { liuqin: liuqinOf(gongWx, hide.qinx[hide.seat.indexOf(i)][2]), ganzhi: hide.qinx[hide.seat.indexOf(i)], from: hide.name }
        : null,
    };
  });
  // 伏神六亲：hide.qin6 直接来自 najia 表（相对本宫），优先用表内值
  if (hide) installed.forEach((yy, i) => {
    const si = hide.seat.indexOf(i);
    if (si >= 0) yy.hidden = { liuqin: hide.qin6[i] ?? yy.hidden?.liuqin, ganzhi: hide.qinx[si], from: hide.name };
  });

  // 变卦六亲（相对本卦宫五行）
  let bianInfo = null;
  if (bian) {
    bianInfo = {
      name: bian.name, mark: bian.mark, gong: bian.gong + '宫',
      qinx: bian.qinx.slice(),
      qin6: bian.qinx.map((q) => liuqinOf(gongWx, q[2])),
    };
  }

  const monthBranch = gz.month[1], dayBranch = gz.day[1];
  const monthWx = BRANCHES_WUXING[monthBranch] || '', dayWx = BRANCHES_WUXING[dayBranch] || '';
  const shiYao = installed[ben.shi], yingYao = installed[ben.ying];
  const relMonth = wxRelation(shiYao.wuxing, monthWx), relDay = wxRelation(shiYao.wuxing, dayWx);

  const out = [];
  out.push('═══ 六爻占卜结果 ═══');
  out.push(`占问: ${p.question}`);
  out.push(`起卦方式: ${p.method} | 起卦时间: ${dt.toISOString().slice(0, 19)}`);
  out.push(`四柱: ${gz.year}年 ${gz.month}月 ${gz.day}日 ${gz.hour}时 | 旬空: ${kong}`);
  out.push(`本卦: ${ben.name} (${gongFull}/${gongWx})`);
  out.push(bianInfo ? `变卦: ${bianInfo.name} (${bianInfo.gong})` : '变卦: 无（六爻安静）');
  out.push('');
  out.push('  六神   六亲   纳甲     爻位      世应  动');
  out.push('  ────   ────   ──────   ──────    ────  ──');
  for (const yy of [...installed].reverse()) {
    const yyS = yy.is_yang ? '阳' : '阴';
    const dong = yy.is_changing ? '← 动' : '';
    const sy = yy.shi ? '[世]' : yy.ying ? '[应]' : '';
    const kongS = yy.kongwang ? ' 空亡' : '';
    out.push(`  ${yy.liushen}  ${yy.liuqin}  ${yy.ganzhi}  ${yy.name}(${yyS})   ${sy}  ${dong}${kongS}`);
    if (yy.hidden) out.push(`         └ 伏神: ${yy.hidden.liuqin}${yy.hidden.ganzhi} (自${yy.hidden.from})`);
  }
  out.push('');
  out.push(`  世爻: ${shiYao.name} ${shiYao.liuqin}${shiYao.ganzhi} | 应爻: ${yingYao.name} ${yingYao.liuqin}${yingYao.ganzhi}`);
  out.push(`  月建(${gz.month})对世爻: ${relMonth} | 日辰(${gz.day})对世爻: ${relDay}`);
  if (moving.length) out.push(`  动爻: ${moving.map((i) => YAO_NAMES[i]).join(', ')}`);

  const counts = {};
  ['父母', '兄弟', '子孙', '妻财', '官鬼'].forEach((q) => { counts[q] = ben.qin6.filter((x) => x === q).length; });

  const keyFindings = [
    `本卦${ben.name}属${gongFull}(宫五行${gongWx})`,
    bianInfo ? `动爻变化后得变卦${bianInfo.name}(${bianInfo.gong})` : '六爻安静，无变卦',
    `安六神: ${gz.day}日起${'青龙'}，初爻${god6[0]}至上爻${god6[5]}`,
  ];
  if (hide) keyFindings.push(`本卦缺失用神类目，伏神: ${hide.seat.map((pos, i) => `${hide.qin6[i]}${hide.qinx[i]}(伏于${YAO_NAMES[pos]}下)`).join(', ')}`);
  keyFindings.push(`六亲分布: ${Object.entries(counts).map(([q, n]) => `${q}${n}`).join(' ')}`);

  const warnings = [];
  if (shiYao.kongwang) warnings.push('世爻逢旬空，自身信心或投入度可能不足，事情落地前需反复确认');
  if (moving.some((i) => installed[i].kongwang)) warnings.push('有动爻落旬空，变化之力暂不落实，事态推进易拖延');
  if (counts['官鬼'] >= 2) warnings.push('官鬼两现及以上，阻碍或压力因素多，注意流程与人事纠纷');
  if (counts['兄弟'] >= 2) warnings.push('兄弟多现，防竞争、分财与破耗');

  const opportunities = [];
  if (counts['子孙'] >= 1) opportunities.push('子孙爻现，有化解压力的力量，可借力打力');
  if (counts['妻财'] >= 1) opportunities.push('妻财爻现，物质与现实层面有支撑');
  if (['比和', '生扶'].includes(relMonth) || ['比和', '生扶'].includes(relDay)) opportunities.push('世爻得月建/日辰生扶，当前时机对己方有利');

  return {
    skill_name: '六爻占卜',
    raw_data: {
      question: p.question, method: p.method, lines: lines6, four_pillars: gz, xunkong: kong,
      ben_gua: { name: ben.name, mark: ben.mark, gong: gongFull, gong_wuxing: gongWx },
      bian_gua: bianInfo, shiy: { shi_position: ben.shi, ying_position: ben.ying },
      lines_detail: installed, moving_lines: moving, has_changing: moving.length > 0,
    },
    structured_output: out.join('\n'),
    key_findings: keyFindings, warnings, opportunities,
    action_suggestions: [
      '六爻反映的是当下能量态势，结果取决于你的应对与行动',
      moving.length ? '动爻是转机所在，围绕动爻所指的人事物提前布局' : '六爻安静，宜守不宜妄动，先稳住现有局面',
      '卦象为趋势参考而非定论，最终走向由你的选择决定',
    ],
  };
}

function gzDayStem(lunar) { return lunar.getDayInGanZhi()[0]; }

// ===== 梅花易数 =====
function meihuaExecute(p) {
  const rnd = mulberry32(getRandomSeed(p.question, p.timestamp));
  let upper, lower, changing;
  if (p.method === 'number_based' && Array.isArray(p.numbers)) {
    const nums = p.numbers.map(Number);
    if (nums.length >= 2) {
      upper = (nums[0] % 8) || 8; lower = (nums[1] % 8) || 8;
      changing = (nums.reduce((a, b) => a + b, 0) % 6) || 6;
    } else {
      const n = nums[0] || 0;
      upper = ((Math.floor(n / 10)) % 8) || 8; lower = (n % 8) || 8; changing = (n % 6) || 6;
    }
  } else if (p.method === 'time_based') {
    let dt;
    try { dt = p.timestamp ? new Date(p.timestamp) : new Date(); } catch { dt = new Date(); }
    const yearBranch = ((dt.getFullYear() - 4) % 12) + 1;
    const month = dt.getMonth() + 1, day = dt.getDate();
    const hourBranch = (Math.floor(((dt.getHours() + 1) % 24) / 2)) + 1;
    upper = ((yearBranch + month + day) % 8) || 8;
    lower = ((yearBranch + month + day + hourBranch) % 8) || 8;
    changing = ((yearBranch + month + day + hourBranch) % 6) || 6;
  } else {
    upper = Math.floor(rnd() * 8) + 1; lower = Math.floor(rnd() * 8) + 1; changing = Math.floor(rnd() * 6) + 1;
  }

  const hexName = (u, l) => (HEXAGRAMS[`${u}|${l}`] || [`${BAGUA[u].name}上${BAGUA[l].name}下`, ''])[0];
  const benKey = `${upper}|${lower}`;
  const ben = HEXAGRAMS[benKey] || [hexName(upper, lower), ''];

  const tiGua = changing <= 3 ? upper : lower;
  const yongGua = changing <= 3 ? lower : upper;
  const tiPos = changing <= 3 ? '上卦' : '下卦';
  const yongPos = changing <= 3 ? '下卦' : '上卦';
  const tiWx = BAGUA[tiGua].wuxing, yongWx = BAGUA[yongGua].wuxing;

  let relation;
  if (tiWx === yongWx) relation = { name: '比和', meaning: '体用同五行，事情平稳，可成但需时间', favorable: true };
  else if (WUXING_SHENG[yongWx] === tiWx) relation = { name: '用生体', meaning: '用卦生扶体卦，外力助我，事易成', favorable: true };
  else if (WUXING_SHENG[tiWx] === yongWx) relation = { name: '体生用', meaning: '体卦生用卦，我去消耗自身成就此事，付出大', favorable: null };
  else if (WUXING_KE[tiWx] === yongWx) relation = { name: '体克用', meaning: '体卦克制用卦，我能掌控局面但费力', favorable: true };
  else relation = { name: '用克体', meaning: '用卦克制体卦，外力压制我，事难成', favorable: false };

  const huUpper = ((upper + lower + 3) % 8) || 8;
  const huLower = ((upper + lower + 5) % 8) || 8;
  const hu = HEXAGRAMS[`${huUpper}|${huLower}`] || [hexName(huUpper, huLower), ''];
  let bianUpper = upper, bianLower = lower;
  if (changing <= 3) bianLower = ((lower + changing) % 8) || 8;
  else bianUpper = ((upper + changing) % 8) || 8;
  const bian = HEXAGRAMS[`${bianUpper}|${bianLower}`] || [hexName(bianUpper, bianLower), ''];

  const now = new Date();
  const month = now.getMonth() + 1;
  const seasonWx = month <= 3 ? '木' : month <= 6 ? '火' : month <= 9 ? '金' : '水';
  const strength = (wx) => wx === seasonWx ? '旺' : WUXING_SHENG[seasonWx] === wx ? '相' : WUXING_SHENG[wx] === seasonWx ? '休' : WUXING_KE[wx] === seasonWx ? '囚' : '衰';
  const tiStrength = strength(tiWx), yongStrength = strength(yongWx);

  const out = [];
  out.push('═══ 梅花易数占卜结果 ═══');
  out.push(`占问: ${p.question}`);
  out.push(`起卦方式: ${p.method}`);
  out.push('');
  out.push(`  本卦: ${ben[0]} (${BAGUA[upper].symbol}${BAGUA[lower].symbol})`);
  out.push(`    ${ben[1]}`);
  out.push(`  互卦: ${hu[0]}`);
  out.push(`  变卦: ${bian[0]} (动爻: 第${changing}爻)`);
  out.push('');
  out.push(`  ┌─ 体卦: ${BAGUA[tiGua].name} (${tiWx}) ← ${tiPos}`);
  out.push(`  └─ 用卦: ${BAGUA[yongGua].name} (${yongWx}) ← ${yongPos}`);
  out.push(`  体用关系: ${relation.name}`);
  out.push(`    └ ${relation.meaning}`);
  out.push('');
  out.push(`  互卦五行: 上${BAGUA[huUpper].wuxing} 下${BAGUA[huLower].wuxing}`);
  out.push('    └ 互卦反映事情发展过程');
  out.push('');
  out.push(`  当令五行: ${seasonWx} (当前季节)`);
  out.push(`  体卦(${tiWx})旺衰: ${tiStrength}`);
  out.push(`  用卦(${yongWx})旺衰: ${yongStrength}`);

  const advice = { 木: '东方、绿色、学习成长、创新开拓', 火: '南方、红色、表达展现、热情投入', 土: '中央、黄色、稳定积累、脚踏实地', 金: '西方、白色、果断决策、精简优化', 水: '北方、黑色、灵活变通、深谋远虑' };

  return {
    skill_name: '梅花易数',
    raw_data: {
      question: p.question, method: p.method,
      ben_gua: { key: benKey, name: ben[0], desc: ben[1] },
      hu_gua: { name: hu[0] }, bian_gua: { name: bian[0], line: changing },
      ti_gua: { name: BAGUA[tiGua].name, wuxing: tiWx, position: tiPos },
      yong_gua: { name: BAGUA[yongGua].name, wuxing: yongWx, position: yongPos },
      ti_yong_relation: relation, changing_line: changing,
    },
    structured_output: out.join('\n'),
    key_findings: [
      `本卦${ben[0]}，${ben[1]}`,
      `体用关系为${relation.name}: ${relation.meaning}`,
      `体卦${tiWx}在当前季节${tiStrength}，用卦${yongWx}${yongStrength}`,
    ],
    warnings: [
      ...(relation.favorable === false ? [`体用关系不利(${relation.name})，事情推进可能遇阻`] : []),
      ...(tiStrength === '衰' ? ['体卦在当前季节处衰弱状态，自身能量不足'] : []),
    ],
    opportunities: [
      ...(relation.favorable === true ? [`体用关系有利(${relation.name})，顺势推进`] : []),
      ...(['旺', '相'].includes(tiStrength) ? ['体卦当令有力，自身状态好'] : []),
    ],
    action_suggestions: [
      '梅花易数以体用生克为核心，但卦象是当下能量的快照，后续行动可以改变走向',
      `体卦为${BAGUA[tiGua].name}(${tiWx})，可从${advice[tiWx] || '平衡发展'}方面着手`,
    ],
  };
}

// ===== 塔罗 =====
function tarotExecute(p) {
  const rnd = mulberry32(getRandomSeed(p.question, p.timestamp || new Date().toISOString()));
  const useReversed = p.use_reversed !== false;
  const majorOnly = p.use_major_only === true;
  const deck = TAROT_DATA.cards.filter((c) => !majorOnly || c.id < 22);
  // 洗牌
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const spread = TAROT_DATA.spreads[p.spread_type] || TAROT_DATA.spreads.three_card;
  const count = Math.min(spread.count, deck.length);
  const drawn = deck.slice(0, count).map((c, i) => ({
    position: spread.positions[i] || `位置${i + 1}`,
    name: c.name, en: c.en, id: c.id,
    reversed: useReversed && rnd() < 0.38,
    upright: c.upright, reversed_meaning: c.reversed,
    is_major: c.id < 22,
  }));

  const out = [];
  out.push('═══ 塔罗牌占卜结果 ═══');
  out.push(`占问: ${p.question}`);
  out.push(`牌阵: ${spread.name}（${count}张）`);
  out.push('');
  for (const c of drawn) {
    out.push(`  【${c.position}】${c.name}（${c.reversed ? '逆位' : '正位'}）`);
    out.push(`    └ ${c.reversed ? c.reversed_meaning : c.upright}`);
  }
  const majors = drawn.filter((c) => c.is_major);
  const revCount = drawn.filter((c) => c.reversed).length;
  out.push('');
  out.push(`  大阿卡纳 ${majors.length} 张 / 逆位 ${revCount} 张`);

  const keyFindings = [`牌阵${spread.name}，核心牌位「${drawn[0].position}」抽到${drawn[0].name}（${drawn[0].reversed ? '逆位' : '正位'}）`];
  if (majors.length >= Math.ceil(count / 2)) keyFindings.push(`大阿卡纳占比高（${majors.length}/${count}），当下正处于人生重要课题期，不是小事`);
  keyFindings.push(`逆位${revCount}张——${revCount > count / 2 ? '能量多有阻滞，事情比预想更曲折' : '牌面能量总体顺畅'}`);
  const warnings = [];
  if (drawn.some((c) => c.name === '死神')) warnings.push('出现死神牌：不是终点，是深刻的换挡与重生，旧模式必须放手');
  if (drawn.some((c) => c.name === '塔') && p.spread_type !== 'single') warnings.push('出现高塔牌：警惕突发变化，提前留好退路与缓冲');
  const opportunities = [];
  const good = drawn.filter((c) => ['太阳', '星星', '命运之轮', '世界', '魔术师'].includes(c.name));
  if (good.length) opportunities.push(`${good.map((c) => c.name).join('、')}在场——时机与资源站在你这边，敢想就敢做`);
  return {
    skill_name: '塔罗牌',
    raw_data: { question: p.question, spread: spread.name, cards: drawn, use_reversed: useReversed },
    structured_output: out.join('\n'),
    key_findings: keyFindings, warnings, opportunities,
    action_suggestions: [
      '塔罗回应的是你当下的能量状态与心态，行动权始终在你手里',
      '重点关注「现在」位置的牌——它提示你现在最该做的调整',
      '同一问题短时间内不宜反复抽牌，先按指引行动一段时间',
    ],
  };
}

// ===== 雷诺曼 =====
function lenormandExecute(p) {
  const rnd = mulberry32(getRandomSeed(p.question, p.timestamp || new Date().toISOString()));
  const deck = LENORMAND_DATA.cards.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const spread = LENORMAND_DATA.spreads[p.spread_type] || LENORMAND_DATA.spreads.three_card;
  const count = Math.min(spread.count, deck.length);
  const drawn = deck.slice(0, count).map((c, i) => ({
    position: spread.positions[i] || `位置${i + 1}`,
    num: c.id, name: c.name, en: c.en, meaning: c.meaning,
  }));

  const out = [];
  out.push('═══ 雷诺曼卡占卜结果 ═══');
  out.push(`占问: ${p.question}`);
  out.push(`牌阵: ${spread.name}（${count}张）`);
  out.push('');
  for (const c of drawn) out.push(`  【${c.position}】${c.num}. ${c.name}（${c.en}）\n    └ ${c.meaning}`);
  if (drawn.length >= 3) {
    const combo = `${drawn[1].name}+${drawn[2].name}`;
    out.push('');
    out.push(`  核心组合: ${combo}——中间两张牌组合出事件的主旋律`);
  }
  const keyFindings = [`核心牌位「${drawn[0].position}」抽到${drawn[0].num}. ${drawn[0].name}：${drawn[0].meaning}`];
  if (drawn.length >= 2) keyFindings.push(`结尾牌位「${drawn[drawn.length - 1].position}」是${drawn[drawn.length - 1].name}——事情走向的落脚点`);
  const warnings = [];
  if (drawn.some((c) => ['山', '十字架', '棺材'].includes(c.name))) warnings.push('出现停滞类牌（山/十字架/棺材），推进过程会慢，别硬冲');
  const opportunities = [];
  if (drawn.some((c) => ['太阳', '三叶草', '星星'].includes(c.name))) opportunities.push('出现幸运类牌（太阳/三叶草/星星），顺风水位可期');
  return {
    skill_name: '雷诺曼卡',
    raw_data: { question: p.question, spread: spread.name, cards: drawn },
    structured_output: out.join('\n'),
    key_findings: keyFindings, warnings, opportunities,
    action_suggestions: [
      '雷诺曼直白务实，答案往往就摆在牌面上，照着做就是',
      '把牌面关键词与你的现实对号入座，别过度脑补',
    ],
  };
}

// ===== 注册表 =====
export const SKILLS = {
  ziwei_analysis: { label: '紫微斗数', execute: ziweiExecute,
    validate(p) { for (const k of ['birth_year', 'birth_month', 'birth_day', 'birth_hour', 'gender']) if (p[k] == null) return `缺少必要参数: ${k}`; return null; } },
  western_astrology: { label: '西方占星', execute: westernExecute,
    validate(p) { for (const k of ['birth_year', 'birth_month', 'birth_day', 'birth_hour']) if (p[k] == null) return `缺少必要参数: ${k}`; return null; } },
  liuyao_divination: { label: '六爻', execute: liuyaoExecute,
    validate(p) { if (!p.question) return '六爻占卜需要提供具体问题'; if (!p.method) return '需要指定起卦方式(method)'; if (p.method === 'manual' && !p.manual_lines) return '手动起卦需要提供manual_lines'; return null; } },
  meihua_divination: { label: '梅花易数', execute: meihuaExecute,
    validate(p) { if (!p.question) return '需要提供占问问题'; if (!p.method) return '需要指定起卦方式'; if (p.method === 'number_based' && !p.numbers) return '数字起卦需要提供至少2个数字'; return null; } },
  tarot_reading: { label: '塔罗牌', execute: tarotExecute,
    validate(p) { if (!p.question) return '需要提供问题'; if (!p.spread_type) return '需要指定牌阵类型'; return null; } },
  lenormand_reading: { label: '雷诺曼卡', execute: lenormandExecute,
    validate(p) { if (!p.question) return '需要提供问题'; if (!p.spread_type) return '需要指定牌阵'; return null; } },
};

export function runSkill(toolName, params) {
  const skill = SKILLS[toolName];
  if (!skill) return { error: `未找到技能: ${toolName}` };
  const err = skill.validate(params || {});
  if (err) return { error: err };
  try {
    return skill.execute(params || {});
  } catch (e) {
    return { error: String(e && e.message || e), skill_name: skill.label };
  }
}
