export const format = value => value===null?'—':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);
