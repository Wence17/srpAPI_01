.PHONY: build build-backend build-web build-datamanagementd test test-backend test-web test-datamanagementd secret-scan

# 一键编译 API + Next.js web
build: build-backend build-web

# 编译后端（复用 apps/api/Makefile）
build-backend:
	@$(MAKE) -C apps/api build

# 编译 Next.js web 应用
build-web:
	@npm run build -w apps/web

# 编译 datamanagementd（宿主机数据管理进程）
build-datamanagementd:
	@cd datamanagement && go build -o datamanagementd ./cmd/datamanagementd

# 运行测试（后端 + Next web）
test: test-backend test-web

test-backend:
	@$(MAKE) -C apps/api test-integration

test-web:
	@npm run css:build -w apps/web
	@npx tsc --noEmit -p apps/web/tsconfig.json

test-datamanagementd:
	@cd datamanagement && go test ./...

secret-scan:
	@python3 tools/secret_scan.py
