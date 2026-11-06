// Coordinate batch mutations between tabs. Do not fall back to an unsafe lock.
export async function withImageBatchLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw Error('当前浏览器不支持安全批量提交，请使用新版 Chrome 或 Edge。');
  return navigator.locks.request(`doodleverse-image-batch:${key}`, { ifAvailable: true }, async lock => {
    if (!lock) throw Error('另一个标签页正在处理此批次，请在原标签页查看。');
    return action();
  });
}
