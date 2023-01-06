const { fse, lodash: _, getRootHome, zip, Logger, getCredential } = require("@serverless-devs/core");
const path = require("path");
const OSS = require('ali-oss');
const PLUGIN_NAME = 'fc-upload-code-to-oss';

async function getCred(inputs) {
  const credentials = _.get(inputs, 'credentials');
  if (!_.isEmpty(credentials)) {
    return credentials;
  }
  credentials = await getCredential(inputs, _.get(inputs, 'project.access'));
  _.set(inputs, 'credentials', credentials);
  return credentials;
}

async function clearDir(zipPath) {
  try {
    fse.removeSync(zipPath)
  } catch (e) {
    // e
  }
}

/**
 * Plugin 插件入口
 * @param inputs 组件的入口参数
 * @param args 插件的自定义参数
 * @return inputs
 */
module.exports = async function index(inputs, args) {
  const logger = new Logger(PLUGIN_NAME);
  const traceId = _.get(process, 'env.serverless_devs_trace_id', '');
  if (_.isEmpty(traceId)) {
    throw new Error('Not found serverless devs trace id');
  }

  const clear = _.get(args, 'clear', false);
  const ossBucket = _.get(args, 'ossBucket');
  if (_.isEmpty(ossBucket)) {
    throw new Error('ossBucket not found');
  }

  const region = _.get(inputs, 'props.region');
  if (_.isEmpty(region)) {
    throw new Error('Not found props region');
  }
  const codeUri = _.get(inputs, 'props.function.codeUri');
  if (_.isEmpty(codeUri)) {
    throw new Error('Not found props code uri');
  }
  // 压缩代码
  const codeResolvePath = path.resolve(codeUri);
  const zipPath = path.join(getRootHome(), 'cache', PLUGIN_NAME, traceId);
  const outputFileName = `${_.replace(codeUri, /\//g, '_')}.zip`;
  const zipFilePath = path.join(zipPath, outputFileName);
  logger.info(`Zip file ${zipFilePath}`);
  if (!fse.existsSync(zipFilePath)) {
    await zip({
      codeUri: codeResolvePath,
      outputFilePath: zipPath,
      outputFileName,
      ignoreFiles: ['.fcignore'],
    });
  } else {
    logger.info(`Zip file ${zipFilePath} already exists, skip zip`);
  }

  // 获取密钥
  const credentials = await getCred(inputs);
  // 构建 OSS 客户端
  const client = new OSS({
    region,
    accessKeyId: _.get(credentials, 'AccessKeyID', ''),
    accessKeySecret: _.get(credentials, 'AccessKeySecret', ''),
    stsToken: _.get(credentials, 'SecurityToken', ''),
    bucket: ossBucket,
    endpoint: `http://oss-${region}.aliyuncs.com`,
    timeout: 300 * 1000,
  });

  // 验证 oss 是否存在
  try {
    logger.debug(`get bucket info: ${ossBucket}`);
    await client.getBucketInfo();
    logger.debug(`bucket: ${ossBucket} exist.`);
  } catch (e) {
    if (clear) {
      clearDir(zipPath);
    }
    // 指定的存储空间不存在或者 bucket 不在该账号下。
    if (
      e.name === 'NoSuchBucketError' ||
      e.message.includes('The bucket you access does not belong to you')
    ) {
      throw new Error(`bucket: ${this.bucket} dose not exist in your account.`);
    }
    throw e;
  }

  // 验证 Object 是否存在
  const ossKey = `fcComponentGeneratedDir/${traceId}/${outputFileName}`;
  try {
    // https://help.aliyun.com/document_detail/111392.html
    await client.head(ossKey, {});
    logger.info(`Object ${ossKey} already exists, skip upload.`);
  } catch (e) {
    logger.debug(`check ${ossKey} failed, error: ${e}.`);

    logger.info('Upload file...');
    // 如果存在异常则尝试上传
    const stream = fse.createReadStream(zipFilePath);
    const { size } = fse.statSync(zipFilePath);
    const result = await client.putStream(ossKey, stream, { contentLength: size });
    logger.debug(
      `Upload ${zipFilePath} to oss bucket: ${ossBucket}, object name: ${ossKey} result:\n${JSON.stringify(result, null, 2)}`,
    );
    logger.info('Successfully uploaded');
  }

  _.set(inputs, 'props.function.ossBucket', ossBucket);
  _.set(inputs, 'props.function.ossKey', ossKey);
  _.unset(inputs, 'props.function.codeUri');
  logger.debug(`Function config is:\n${JSON.stringify(_.get(inputs, 'props.function', {}), null, 2)}`);
  if (clear) {
    clearDir(zipPath);
  }

  return inputs;
};