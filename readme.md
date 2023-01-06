## 插件使用

```
edition: 1.0.0        #  命令行YAML规范版本，遵循语义化版本（Semantic Versioning）规范
name: component-test   #  项目名称

services:
  component:
    component: fc
    actions:
      pre-deploy:
        - plugin: fc-upload-code-to-oss
          args:
            ossBucket: serverless-devs-cn-hangzhou-oss-1740298130743624 # 必须，因为要上传到指定 bucket
            clear: true # 选填，会清理掉创建的本地目录
    props:
      region: cn-hangzhou
      service:
        name: "test-oss-to-fc"
      function:
        name: "test"
        description: 'hello world by serverless devs'
        runtime: nodejs14
        ossBucket: ${vars.bucket}
        codeUri: ./code
        handler: index.handler
        memorySize: 128
        timeout: 60
```
