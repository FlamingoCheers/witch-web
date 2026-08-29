// 工具定义（OpenAI function calling 格式）——与安卓 tools_definition.json 同源，仅含 Web 版 6 技能
export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'ziwei_analysis',
      description: '紫微斗数分析。根据用户出生时间排出紫微斗数原盘，确定命宫、身宫、十二宫位及主星分布、生年四化，解读命格格局与各领域配置。适用于：深度性格与命运格局分析、十二宫位解读。注：不计算大限和流年，仅分析原盘格局。',
      parameters: {
        type: 'object',
        properties: {
          birth_year: { type: 'integer', description: '出生年份（公历）。直接照抄用户说的数字，禁止自行换算农历或干支' },
          birth_month: { type: 'integer', description: '出生月份（公历），1-12' },
          birth_day: { type: 'integer', description: '出生日期（公历），1-31' },
          birth_hour: { type: 'integer', description: '出生小时（24小时制），0-23。23点属晚子时，引擎自动处理日柱滚动，直接照传即可' },
          gender: { type: 'string', enum: ['male', 'female'], description: '性别' },
          question: { type: 'string', description: '用户的具体问题' },
          analysis_focus: { type: 'string', enum: ['comprehensive', 'destiny_palace', 'career_palace', 'wealth_palace', 'love_palace', 'health_palace'], description: '分析侧重点' },
        },
        required: ['birth_year', 'birth_month', 'birth_day', 'birth_hour', 'gender'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'western_astrology',
      description: '西方占星学分析。根据出生时间地点计算太阳星座、月亮星座、上升星座、行星落座与宫位、主要相位，解读个人星盘。适用于：性格深度分析、天赋与潜力解读、关系分析、流年运势参考。',
      parameters: {
        type: 'object',
        properties: {
          birth_year: { type: 'integer', description: '出生年份（公历）' },
          birth_month: { type: 'integer', description: '出生月份，1-12' },
          birth_day: { type: 'integer', description: '出生日期，1-31' },
          birth_hour: { type: 'integer', description: '出生小时（当地时钟24小时制），0-23。直接照抄用户说的数字' },
          birth_minute: { type: 'integer', description: '出生分钟，0-59' },
          latitude: { type: 'number', description: '出生地纬度，如 39.9042（北京）。不知道可留默认' },
          longitude: { type: 'number', description: '出生地经度，如 116.4074（北京）' },
          timezone_offset: { type: 'number', description: '出生地时区偏移（小时），如东八区为8。不知道可留默认' },
          question: { type: 'string', description: '用户的具体问题' },
          analysis_focus: { type: 'string', enum: ['comprehensive', 'personality', 'career_talent', 'relationship', 'transit'], description: '分析侧重点' },
        },
        required: ['birth_year', 'birth_month', 'birth_day', 'birth_hour'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'liuyao_divination',
      description: '六爻占卜。针对用户提出的具体问题起卦，通过六次摇卦（或时间起卦）得到六爻卦象，完整装卦（纳甲六亲世应六神伏神旬空），分析世应关系、动爻变化，判断事情吉凶成败。适用于：具体事件的吉凶判断（如"这件事能不能成"），需要明确单一问题。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '用户要占问的具体问题，必须是明确的一件事' },
          method: { type: 'string', enum: ['time_based', 'random', 'manual'], description: '起卦方式：time_based=时间起卦，random=随机摇卦，manual=手动指定爻象' },
          manual_lines: { type: 'array', description: '手动起卦时从初爻到上爻的六个爻值（6=老阴,7=少阳,8=少阴,9=老阳）', items: { type: 'integer', enum: [6, 7, 8, 9] }, minItems: 6, maxItems: 6 },
          timestamp: { type: 'string', description: '起卦时间，ISO8601格式。留空则使用当前时间。' },
          context: { type: 'string', description: '问题的背景信息' },
        },
        required: ['question', 'method'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'meihua_divination',
      description: '梅花易数占卜。根据时间、数字或随机起卦，得到体卦与用卦（本卦、互卦、变卦），通过五行生克关系和卦象含义进行快速判断。适用于：快速占卜、随机事件的吉凶判断、数字占卜。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '用户要占问的问题' },
          method: { type: 'string', enum: ['time_based', 'number_based', 'random'], description: '起卦方式：time_based=时间起卦，number_based=数字起卦，random=随机起卦' },
          numbers: { type: 'array', description: '数字起卦时用户提供的数字（至少2个）', items: { type: 'integer' }, minItems: 2 },
          timestamp: { type: 'string', description: '起卦时间，ISO8601格式。留空则使用当前时间。' },
        },
        required: ['question', 'method'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tarot_reading',
      description: '塔罗牌占卜。使用标准78张韦特塔罗牌（22张大阿卡纳+56张小阿卡纳），支持多种牌阵，抽取牌面并分析正逆位含义。适用于：直觉性指引、情感关系探索、心理状态分析、未来趋势参考、日常灵感指引。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '用户的问题或探索主题' },
          spread_type: { type: 'string', enum: ['single', 'three_card', 'celtic_cross', 'relationship', 'past_present_future', 'yes_no', 'mind_body_spirit'], description: '牌阵类型' },
          use_reversed: { type: 'boolean', description: '是否使用逆位，默认true' },
          use_major_only: { type: 'boolean', description: '是否仅使用大阿卡纳（22张），默认false' },
          context: { type: 'string', description: '问题的背景信息' },
        },
        required: ['question', 'spread_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lenormand_reading',
      description: '雷诺曼卡占卜。使用36张雷诺曼卡进行占卜，支持多种牌阵。雷诺曼卡以直白、具体、务实著称，擅长给出明确的事件预测和实际生活指引。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '用户的具体问题' },
          spread_type: { type: 'string', enum: ['single', 'three_card', 'five_card', 'nine_card', 'grand_tableau'], description: '牌阵类型：single=单牌，three_card=三牌，five_card=五牌线阵，nine_card=九宫阵，grand_tableau=大桌阵' },
          context: { type: 'string', description: '问题的背景信息' },
        },
        required: ['question', 'spread_type'],
      },
    },
  },
];
