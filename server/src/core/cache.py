"""
🛡️ L: 全局应用缓存模块

所有带失效机制的缓存集中在此处管理。
任何账单的增删改必须调用 clear_overview_cache() 使对应缓存失效。
"""
from cachetools import TTLCache
import threading

# Dashboard 概览缓存 — 5 分钟 TTL
_overview_cache = TTLCache(maxsize=128, ttl=300)
_cache_lock = threading.Lock()


def clear_overview_cache():
    """🛡️ L: 强制清除所有大盘概览缓存（记账即刷新）"""
    with _cache_lock:
        keys = list(_overview_cache.keys())
        for k in keys:
            del _overview_cache[k]


def get_cached_overview(book_id: str, date_from_str: str, date_to_str: str):
    """返回缓存数据，不存在返回 None"""
    cache_key = (book_id, date_from_str, date_to_str)
    with _cache_lock:
        return _overview_cache.get(cache_key)


def set_cached_overview(book_id: str, date_from_str: str, date_to_str: str, data: dict):
    """写入缓存"""
    cache_key = (book_id, date_from_str, date_to_str)
    with _cache_lock:
        _overview_cache[cache_key] = data
