const stamp = () => new Date().toISOString();
const write = (level, stream, args) => stream(`${stamp()} ${level}`, ...args);

export const logger = {
  info: (...a) => write('INFO ', console.log, a),
  warn: (...a) => write('WARN ', console.warn, a),
  error: (...a) => write('ERROR', console.error, a),
  debug: (...a) => (process.env.NODE_ENV === 'production' ? undefined : write('DEBUG', console.log, a)),
};
