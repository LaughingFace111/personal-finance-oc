import { useState, useEffect } from 'react'
import { Card, Button, Tag, Empty, Spin, message, Modal, Form, InputNumber, Input, Popconfirm, DatePicker, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined, FallOutlined, AccountBookOutlined } from '@ant-design/icons'
import { apiGet, apiPost, apiPatch, apiDelete } from '../services/api'
import { useAuth } from '../App'
import dayjs from 'dayjs'

interface DurableAsset {
  id: string
  name: string
  purchase_price: string
  purchase_date: string
  is_retired: boolean
  retire_date?: string
  book_id: string
  created_at: string
  updated_at: string
  days_used: number
  daily_cost: string
}

export default function DurableAssetsPage() {
  const { user } = useAuth()
  const [assets, setAssets] = useState<DurableAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const bookId = user?.default_book_id

  useEffect(() => {
    if (!bookId) return
    loadAssets()
  }, [bookId])

  const loadAssets = async () => {
    try {
      setLoading(true)
      const data = await apiGet<DurableAsset[]>('/api/durable-assets')
      setAssets(data || [])
    } catch (err: any) {
      message.error(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (values: any) => {
    try {
      setSubmitting(true)
      await apiPost('/api/durable-assets', {
        name: values.name,
        purchase_price: values.purchase_price,
        purchase_date: values.purchase_date.format('YYYY-MM-DD'),
      })
      message.success('资产已登记')
      setModalOpen(false)
      form.resetFields()
      loadAssets()
    } catch (err: any) {
      message.error(err.message || '添加失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetire = async (asset: DurableAsset) => {
    try {
      await apiPatch(`/api/durable-assets/${asset.id}`, {
        is_retired: true,
        retire_date: dayjs().format('YYYY-MM-DD'),
      })
      message.success('已标记为退役')
      loadAssets()
    } catch (err: any) {
      message.error(err.message || '操作失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/api/durable-assets/${id}`)
      message.success('已删除')
      loadAssets()
    } catch (err: any) {
      message.error(err.message || '删除失败')
    }
  }

  const formatPrice = (v: string | number) =>
    Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const totalValue = assets.reduce((s, a) => s + Number(a.purchase_price), 0)
  const avgDailyCost = assets.length
    ? (assets.reduce((s, a) => s + Number(a.daily_cost), 0) / assets.length)
    : 0

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      {/* 顶部操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 18, fontWeight: 600 }}>大件日均成本</span>
          {assets.length > 0 && (
            <span style={{ marginLeft: 8, color: '#999', fontSize: 13 }}>
              {assets.filter(a => !a.is_retired).length} 件在用 · 总价值 ¥{formatPrice(totalValue)}
            </span>
          )}
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          登记大件
        </Button>
      </div>

      {/* 汇总卡片 */}
      {assets.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, background: '#f0f5ff', border: '1px solid #adc6ff' }} bodyStyle={{ padding: '12 16' }}>
          <div style={{ display: 'flex', gap: 32 }}>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>总购置成本</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#333' }}>¥{formatPrice(totalValue)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>日均成本合计</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f45b26', display: 'flex', alignItems: 'center', gap: 4 }}>
                ⬇️ ¥{avgDailyCost.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>总在用天数</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#333' }}>
                {assets.filter(a => !a.is_retired).reduce((s, a) => s + a.days_used, 0)} 天
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 列表 */}
      {assets.length === 0 ? (
        <Empty
          image={<AccountBookOutlined style={{ fontSize: 48, color: '#ccc' }} />}
          description="还没有登记大件，来记一笔吧～"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {assets.map(asset => (
            <Card
              key={asset.id}
              size="small"
              style={{
                opacity: asset.is_retired ? 0.55 : 1,
                border: asset.is_retired ? '1px solid #d9d9d9' : '1px solid #91caff'
              }}
              bodyStyle={{ padding: 14 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <AccountBookOutlined style={{ color: '#1677ff', fontSize: 16 }} />
                    <span style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: asset.is_retired ? '#999' : '#262626',
                      textDecoration: asset.is_retired ? 'line-through' : 'none'
                    }}>
                      {asset.name}
                    </span>
                    <Tag color={asset.is_retired ? 'default' : 'blue'}>
                      {asset.is_retired ? '🏁 已退役' : '⚡ 在用'}
                    </Tag>
                  </div>

                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    {/* 购置原价 */}
                    <div>
                      <div style={{ fontSize: 11, color: '#999', marginBottom: 1 }}>购置原价</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>
                        ¥{formatPrice(asset.purchase_price)}
                      </div>
                    </div>

                    {/* 已陪伴天数 */}
                    <div>
                      <div style={{ fontSize: 11, color: '#999', marginBottom: 1 }}>已陪伴</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>
                        {asset.days_used} 天
                      </div>
                    </div>

                    {/* 日均成本 */}
                    {!asset.is_retired && (
                      <div>
                        <div style={{ fontSize: 11, color: '#999', marginBottom: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                          日均成本
                          <Tooltip title="每天摊薄一点，钱没白花 💰">
                            <span style={{ cursor: 'help', fontSize: 10 }}>ⓘ</span>
                          </Tooltip>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#f45b26', display: 'flex', alignItems: 'center', gap: 3 }}>
                          ⬇️ ¥{formatPrice(asset.daily_cost)}
                          <span style={{ fontSize: 11, color: '#f45b26', fontWeight: 400 }}>/天</span>
                        </div>
                      </div>
                    )}

                    {asset.is_retired && asset.retire_date && (
                      <div>
                        <div style={{ fontSize: 11, color: '#999', marginBottom: 1 }}>退役日期</div>
                        <div style={{ fontSize: 14, color: '#999' }}>{asset.retire_date}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginLeft: 12 }} onClick={e => e.stopPropagation()}>
                  {!asset.is_retired && (
                    <Button size="small" onClick={() => handleRetire(asset)}>
                      退役
                    </Button>
                  )}
                  <Popconfirm
                    title="确定删除该资产记录？"
                    onConfirm={() => handleDelete(asset.id)}
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
        title="登记大件"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleAdd} style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="物品名称"
            rules={[{ required: true, message: '请输入物品名称' }]}
          >
            <Input placeholder="例如：MacBook Pro 14寸" maxLength={200} showCount />
          </Form.Item>

          <Form.Item
            name="purchase_price"
            label="购买原价"
            rules={[{ required: true, message: '请输入购买原价' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="例如：16999"
              min={0.01}
              precision={2}
              prefix="¥"
            />
          </Form.Item>

          <Form.Item
            name="purchase_date"
            label="购买日期"
            rules={[{ required: true, message: '请选择购买日期' }]}
            initialValue={dayjs()}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button onClick={() => { setModalOpen(false); form.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              登记
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
