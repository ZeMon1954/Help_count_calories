// tsx asks os.userInfo() for a temporary-directory suffix on Windows.
// Some restricted Windows sessions cannot resolve it; a process-local suffix is sufficient.
if (process.platform === 'win32' && typeof process.geteuid !== 'function') {
  process.geteuid = () => process.pid;
}
