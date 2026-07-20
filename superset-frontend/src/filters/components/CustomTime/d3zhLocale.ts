export function setupChineseLocale() {
  try {
    // 尝试多种方式设置中文 locale
    const locale = {
      dateTime: '%Y年%m月%d日 %A %X',
      date: '%Y年%m月%d日',
      time: '%H:%M:%S',
      periods: ['上午', '下午'],
      days: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
      shortDays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
      months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
      shortMonths: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    };

    // 方式1: 直接 require
    const d3tf = require('d3-time-format');
    if (d3tf && d3tf.timeFormatDefaultLocale) {
      d3tf.timeFormatDefaultLocale(locale);
    }

    // 方式2: 通过 d3 主包
    try {
      const d3 = require('d3');
      if (d3 && d3.timeFormatDefaultLocale) {
        d3.timeFormatDefaultLocale(locale);
      }
    } catch (e) {
      // d3 主包可能不存在
    }
  } catch (e) {
    console.warn('Failed to set Chinese locale:', e);
  }
}
