export function encodeWav(channels, sourceRate, targetRate = 16000) {
  if (
    !channels?.length ||
    !channels[0]?.length ||
    sourceRate < 8000 ||
    sourceRate > 192000
  )
    throw new Error("没有可识别的录音。");
  const length = Math.floor((channels[0].length * targetRate) / sourceRate),
    bytes = new Uint8Array(44 + length * 2),
    view = new DataView(bytes.buffer);
  const ascii = (offset, value) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, length * 2, true);
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < length; i++) {
    let sum = 0,
      count = 0;
    const start = Math.floor(i * ratio),
      end = Math.min(
        channels[0].length,
        Math.max(start + 1, Math.floor((i + 1) * ratio)),
      );
    for (let j = start; j < end; j++)
      for (const channel of channels) {
        sum += channel[j] || 0;
        count++;
      }
    const sample = Math.max(-1, Math.min(1, sum / count));
    view.setInt16(
      44 + i * 2,
      Math.round(sample * (sample < 0 ? 32768 : 32767)),
      true,
    );
  }
  return bytes;
}
export async function recordingToWav(blob) {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio)
    throw new Error("当前浏览器无法处理录音，请使用新版 Chrome 或 Edge。");
  const context = new Audio();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    if (buffer.duration < 0.25) throw new Error("录音太短，请再说一次。");
    return new Blob(
      [
        encodeWav(
          Array.from({ length: buffer.numberOfChannels }, (_, i) =>
            buffer.getChannelData(i),
          ),
          buffer.sampleRate,
        ),
      ],
      { type: "audio/wav" },
    );
  } finally {
    await context.close();
  }
}
export const blobDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("无法读取录音，请重试。"));
    reader.readAsDataURL(blob);
  });
