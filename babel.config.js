// Metro resolves `babel-preset-expo` implicitly; Jest (via jest-expo) needs it declared
// explicitly here, since babel-jest doesn't go through Metro at all.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
