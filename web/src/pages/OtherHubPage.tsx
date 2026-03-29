import { useNavigate } from 'react-router-dom';
import { Card, Row, Col } from 'antd';

const menuItems = [
  {
    key: 'installment',
    title: '分期消费',
    description: '信用卡分期消费计划管理',
    icon: '💳',
    path: '/other/installment',
  },
  {
    key: 'lend',
    title: '借出登记',
    description: '记录借给他人的资金往来',
    icon: '📤',
    path: '/other/lend',
  },
  {
    key: 'borrow',
    title: '借入登记',
    description: '记录向他人的借款往来',
    icon: '📥',
    path: '/other/borrow',
  },
];

export default function OtherHubPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen px-4 py-5" style={{ background: 'var(--bg-page)' }}>
      <div className="mx-auto max-w-md">
        {/* 顶部导航 */}
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="返回"
            className="flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm transition"
            style={{
              borderColor: 'var(--border-color)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="text-xl leading-none">←</span>
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">其他交易</h1>
        </div>

        {/* 功能菜单卡片 */}
        <Row gutter={[16, 16]}>
          {menuItems.map((item) => (
            <Col span={12} key={item.key}>
              <Card
                hoverable
                onClick={() => navigate(item.path)}
                style={{
                  borderRadius: 16,
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
                styles={{ body: { padding: '20px 16px' } }}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>{item.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.description}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
}