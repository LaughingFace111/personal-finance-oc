import { useState, useEffect } from 'react'
import { Card, Button, Tag, Empty, Spin, message, Modal, Form, InputNumber, Input, Popconfirm } from 'antd'
import { PlusOutlined, DeleteOutlined, LinkOutlined, ShoppingOutlined } from '@ant-design/icons'
import { apiGet, apiPost, apiPatch, apiDelete } from '../services/api'
import { useAuth } from '../App'

interface WishlistItem {
  id: string
  name: string
  url?: string
  target_price?: string
  status: string
  book_id: string
  created_at: string
  updated_at: string
}

export default function WishlistPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const bookId = user?.default_book_id

  useEffect(() => {
    if (!bookId) return
    loadItems()
  }, [bookId])

  const loadItems = async () => {
    try {
      setLoading(true)
      const data = await apiGet<WishlistItem[]>('/api/wishlists')
      setItems(data || [])
    } catch (err: any) {
      message.error(err.message || '加载愿望单失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (values: any) => {
    try {
      setSubmitting(true)
      await apiPost('/api/wishlists', {
        name: values.name,
        url: values.url || null,
        target_price: values.target_price || null,
        status: 'pending',
      })
      message.success('已添加到愿望单')
      setModalOpen(false)
      form.resetFields()
      loadItems()
    } catch (err: any) {
      message.error(err.message || '添加失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/api/wishlists/${id}`)
      message.success('已删除')
      loadItems()
    } catch (err: any) {
      message.error(err.message || '删除失败')
    }
  }

  const handleMarkPurchased = async (item: WishlistItem) => {
    try {
      await apiPatch(`/api/wishlists/${item.id}`, { status: 'purchased' })
      message.success('已标记为已购')
      loadItems()
    } catch (err: any) {
      message.error(err.message || '操作失败')
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 rounded-2xl border p-5 shadow-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">愿望单</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {items.filter(i => i.status === 'pending').length} 件待购，统一记录想买但还没下单的物品。
          </p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
        >
          添加心愿
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border p-8 shadow-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
          <Empty
            image={<ShoppingOutlined style={{ fontSize: 48, color: '#ccc' }} />}
            description="愿望单是空的，加一个吧～"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <Card
              key={item.id}
              size="small"
              style={{
                opacity: item.status === 'purchased' ? 0.6 : 1,
                border: item.status === 'purchased' ? '1px solid var(--border-color)' : '1px solid #91caff',
                borderRadius: 16,
                background: 'var(--bg-card)',
                boxShadow: 'var(--shadow-card)',
              }}
              bodyStyle={{ padding: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 16,
                      fontWeight: 600,
                      textDecoration: item.status === 'purchased' ? 'line-through' : 'none',
                      color: item.status === 'purchased' ? 'var(--text-tertiary)' : 'var(--text-primary)'
                    }}>
                      {item.name}
                    </span>
                    <Tag color={item.status === 'purchased' ? 'green' : 'blue'}>
                      {item.status === 'purchased' ? '✅ 已购' : '⏳ 待购'}
                    </Tag>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {item.target_price && (
                      <span style={{ color: '#f45b26', fontWeight: 600, fontSize: 14 }}>
                        ¥{Number(item.target_price).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1677ff' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <LinkOutlined /> 去购买
                      </a>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginLeft: 12 }} onClick={e => e.stopPropagation()}>
                  {item.status === 'pending' && (
                    <Button size="small" onClick={() => handleMarkPurchased(item)}>
                      标记已购
                    </Button>
                  )}
                  <Popconfirm
                    title="确定删除？"
                    onConfirm={() => handleDelete(item.id)}
                    okText="删除"
                    cancelText="取消"
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 新增弹窗 */}
      <Modal
        title="添加心愿"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleAdd} style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="商品名称"
            rules={[{ required: true, message: '请输入商品名称' }]}
          >
            <Input placeholder="例如：iPhone 16 Pro" maxLength={200} showCount />
          </Form.Item>

          <Form.Item
            name="target_price"
            label="预算 / 预计价格"
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="例如：8999"
              min={0}
              precision={2}
              prefix="¥"
            />
          </Form.Item>

          <Form.Item
            name="url"
            label="购买链接"
          >
            <Input placeholder="https://..." allowClear />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setModalOpen(false); form.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              添加
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
