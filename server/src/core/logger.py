"""
日志系统配置

功能：
- 业务日志：记录业务操作
- 审计日志：记录数据变更、用户操作
- 支持文件和控制台输出
- 支持 JSON 格式
"""

import json
import logging
import os
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional
from logging.handlers import RotatingFileHandler


class JsonFormatter(logging.Formatter):
    """JSON 格式化器"""

    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # 添加异常信息
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # 添加额外字段
        if hasattr(record, "extra_data"):
            log_data["extra"] = record.extra_data

        # 添加用户信息
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id

        # 添加操作类型
        if hasattr(record, "action"):
            log_data["action"] = record.action

        return json.dumps(log_data, ensure_ascii=False, default=_json_default)


def _json_default(obj: Any) -> Any:
    """JSON 序列化默认值"""
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "__dict__"):
        return obj.__dict__
    return str(obj)


def _get_log_dir() -> str:
    """获取日志目录"""
    log_dir = os.environ.get("LOG_DIR", "/home/joshua/openclaw/workspace/personal-finance/server/logs")
    os.makedirs(log_dir, exist_ok=True)
    return log_dir


def setup_logger(
    name: str,
    log_file: Optional[str] = None,
    level: int = logging.INFO,
    json_format: bool = False,
    max_bytes: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 5,
) -> logging.Logger:
    """设置日志器"""
    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.handlers.clear()

    # 处理器
    handlers = []

    # 文件处理器
    if log_file:
        file_path = os.path.join(_get_log_dir(), log_file)
        file_handler = RotatingFileHandler(
            file_path,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.setLevel(level)
        if json_format:
            file_handler.setFormatter(JsonFormatter())
        else:
            file_handler.setFormatter(
                logging.Formatter(
                    "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
                )
            )
        handlers.append(file_handler)

    # 控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setLevel(level)
    if json_format:
        console_handler.setFormatter(JsonFormatter())
    else:
        console_handler.setFormatter(
            logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        )
    handlers.append(console_handler)

    for handler in handlers:
        logger.addHandler(handler)

    return logger


# ==================== 预定义的日志器 ====================

# 业务日志 - 记录业务操作
business_logger = setup_logger(
    "business",
    log_file="business.log",
    level=logging.INFO,
    json_format=False,
)

# 审计日志 - 记录数据变更、用户操作
audit_logger = setup_logger(
    "audit",
    log_file="audit.log",
    level=logging.INFO,
    json_format=True,
)

# 系统日志 - 记录系统事件
system_logger = setup_logger(
    "system",
    log_file="system.log",
    level=logging.WARNING,
    json_format=False,
)


# ==================== 便捷函数 ====================

def log_business(
    action: str,
    message: str,
    extra_data: Optional[Dict] = None,
    user_id: Optional[str] = None,
):
    """记录业务日志"""
    extra = extra_data or {}
    if user_id:
        extra["user_id"] = user_id
    business_logger.info(f"[{action}] {message}", extra={"extra_data": extra})


def log_audit(
    action: str,
    user_id: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Optional[Dict] = None,
    ip_address: Optional[str] = None,
):
    """记录审计日志"""
    audit_data = {
        "action": action,
        "user_id": user_id,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": details or {},
    }
    if ip_address:
        audit_data["ip_address"] = ip_address

    audit_logger.info(
        f"{user_id} - {action} - {resource_type}",
        extra={
            "action": action,
            "user_id": user_id,
            "extra_data": audit_data,
        },
    )


def log_error(logger_name: str, action: str, error: Exception, extra_data: Optional[Dict] = None):
    """记录错误日志"""
    logger = logging.getLogger(logger_name)
    extra = extra_data or {}
    logger.error(f"[{action}] {str(error)}", extra={"extra_data": extra}, exc_info=True)