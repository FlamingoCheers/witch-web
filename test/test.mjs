// 引擎 node 单测：node test/test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
globalThis.window = globalThis;
for (const f of ['vendor/astronomy.js', 'vendor/lunar.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const { runSkill, SKILLS } = await import(pathToFileURL(path.join(root, 'js/engines.js')).href);
const { mdToHtml } = await import(pathToFileURL(path.join(root, 'js/md.js')).href);

let pass = 0, fail = 0;
function ok(cond, name, extra = '') {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
}

// 1) western：对照安卓已验证结果 1995-9-1 16:00 北京
{
  const r = runSkill('western_astrology', { birth_year: 1995, birth_month: 9, birth_day: 1, birth_hour: 16, birth_minute: 0, latitude: 39.9042, longitude: 116.4074, timezone_offset: 8 });
  ok(!r.error, 'western runs', r.error);
  const sun = r.raw_data.planets.find((p) => p.planet === '太阳');
  const moon = r.raw_data.planets.find((p) => p.planet === '月亮');
  ok(sun && sun.sign === '处女座' && Math.abs(sun.degree - 8.49) < 0.3, 'sun virgo 8.49', JSON.stringify(sun));
  ok(moon && moon.sign === '天蝎座' && Math.abs(moon.degree - 24.85) < 0.3, 'moon scorpio 24.85', JSON.stringify(moon));
  ok(r.raw_data.rising_sign === '巨蟹座', 'asc cancer', r.raw_data.rising_sign);
  ok(r.raw_data.mc_sign === '天蝎座', 'mc scorpio', r.raw_data.mc_sign);
}

// 2) ziwei
{
  const r = runSkill('ziwei_analysis', { birth_year: 1995, birth_month: 9, birth_day: 1, birth_hour: 16, gender: 'male' });
  ok(!r.error, 'ziwei runs', r.error);
  if (!r.error) {
    ok(r.raw_data.palaces.length === 12, '12 palaces');
    ok(r.raw_data.wuxing_jv && r.raw_data.ming_gong_branch, 'wuxing/minggong present', JSON.stringify({ jv: r.raw_data.wuxing_jv, ming: r.raw_data.ming_gong_branch }));
    ok(r.structured_output.includes('紫微斗数排盘结果'), 'output format');
  }
}

// 3) liuyao：乾卦全阳静爻 bits=63 → 乾为天 乾宫 世上应三
{
  const r = runSkill('liuyao_divination', { question: '测试占问', method: 'manual', manual_lines: [7, 7, 7, 7, 7, 7] });
  ok(!r.error, 'liuyao qian runs', r.error);
  if (!r.error) {
    ok(r.raw_data.ben_gua.name.includes('乾'), 'ben = qian', r.raw_data.ben_gua.name);
    ok(r.raw_data.ben_gua.gong === '乾宫', 'gong qian', r.raw_data.ben_gua.gong);
    ok(r.raw_data.shiy.shi_position === 5 && r.raw_data.shiy.ying_position === 2, 'shi5 ying2', JSON.stringify(r.raw_data.shiy));
    ok(r.raw_data.lines_detail.length === 6 && r.raw_data.lines_detail[0].liushen, 'liushen installed', JSON.stringify(r.raw_data.lines_detail[0]));
    ok(r.raw_data.four_pillars.day.length === 2, 'day ganzhi', r.raw_data.four_pillars.day);
  }
  // 坤 bits=0 → 坤为地
  const r2 = runSkill('liuyao_divination', { question: '测试', method: 'manual', manual_lines: [8, 8, 8, 8, 8, 8] });
  ok(!r2.error && r2.raw_data.ben_gua.name.includes('坤') && r2.raw_data.ben_gua.gong === '坤宫', 'kun table', JSON.stringify(r2.raw_data.ben_gua || r2));
  // 一动爻：初爻老阳 9 其余静 → 变卦存在
  const r3 = runSkill('liuyao_divination', { question: '测试', method: 'manual', manual_lines: [9, 7, 7, 7, 7, 7] });
  ok(!r3.error && r3.raw_data.bian_gua && r3.raw_data.has_changing, 'bian gua on line1 moving', JSON.stringify(r3.raw_data.bian_gua || r3));
}

// 4) meihua
{
  const r = runSkill('meihua_divination', { question: '测试', method: 'number_based', numbers: [7, 3] });
  ok(!r.error, 'meihua number runs', r.error);
  if (!r.error) ok(r.raw_data.ben_gua.name.length > 0 && r.raw_data.ti_gua.wuxing, 'meihua structure', JSON.stringify(r.raw_data.ben_gua));
}

// 5) tarot / lenormand
{
  const r = runSkill('tarot_reading', { question: '测试', spread_type: 'three_card' });
  ok(!r.error && r.raw_data.cards.length === 3, 'tarot three cards', r.error || r.raw_data.cards.length);
  const r2 = runSkill('lenormand_reading', { question: '测试', spread_type: 'five_card' });
  ok(!r2.error && r2.raw_data.cards.length === 5, 'lenormand five cards', r2.error || r2.raw_data.cards.length);
  const r3 = runSkill('tarot_reading', { question: '测试', spread_type: 'celtic_cross' });
  ok(!r3.error && r3.raw_data.cards.length === 10, 'tarot celtic 10', r3.error);
}

// 6) 校验错误路径
ok(!!runSkill('western_astrology', {}).error, 'western missing params -> error');
ok(!!runSkill('liuyao_divination', { question: 'x' }).error, 'liuyao no method -> error');

// 7) markdown
{
  const h = mdToHtml('# 标题\n**粗** 和 *斜* 与 `code`\n- 甲\n- 乙');
  ok(h.includes('<b>标题</b>') && h.includes('<b>粗</b>') && h.includes('<i>斜</i>') && h.includes('<code>code</code>') && h.includes('<li>甲</li>'), 'md render', h);
  ok(!mdToHtml('**a**').includes('**'), 'md strips stars');
}

console.log(`\n== ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
