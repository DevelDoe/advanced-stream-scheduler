module.exports = {
  require: ['@babel/register'],
  extension: ['js'],
  spec: 'tests/**/*.test.js',
  timeout: 5000,
  exit: true,
  recursive: true,
  reporter: 'spec'
};
