import { CORE_CONFIG_SCHEMA } from '../../../lib/config/schema.js';

const configManifest = Object.freeze({
  id: '08',
  key: 'config',
  area: 'core',
  name: '配置中心',
  enabledByDefault: true,
  dependencies: [],
  permissions: ['yunjin.config.read', 'yunjin.config.write'],
  commands: [
    '#云锦 配置 查看',
    '#云锦 配置 获取 <作用域> <键>',
    '#云锦 配置 设置 <作用域> <键> <JSON值>',
    '#云锦 配置 重载',
    '#云锦 配置 校验'
  ],
  configSchema: CORE_CONFIG_SCHEMA
});

export default configManifest;
