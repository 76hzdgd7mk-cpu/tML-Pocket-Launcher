import { Badge } from '../../components/ui';
import { useTranslation } from '../../i18n';
import type { NativeMod } from '../../native/models';

const STATUS_LABELS = {
  missing: '缺失',
  outdated: '版本不足',
  disabled: '未启用',
  enabled: '已启用',
};

export function ModDependencies({ mod }: { mod: NativeMod }) {
  const { t } = useTranslation();
  if (mod.error) return <p>{mod.error}</p>;
  if (!mod.dependencies)
    return <p>{mod.deps.length ? mod.deps.join(t('、')) : t('没有声明依赖。')}</p>;
  if (!mod.dependencies.length) return <p>{t('没有声明依赖。')}</p>;

  return (
    <ul className="mod-dependency-list" aria-label={t('模组依赖状态')}>
      {mod.dependencies.map((dependency) => (
        <li
          key={JSON.stringify([dependency.name, dependency.requiredVersion, dependency.optional])}
        >
          <strong>{dependency.title}</strong>
          <Badge>{t(dependency.optional ? '可选' : '必需')}</Badge>
          <Badge tone={dependency.status === 'enabled' ? 'green' : ''}>
            {t(STATUS_LABELS[dependency.status])}
          </Badge>
          {(dependency.requiredVersion || dependency.installedVersion) && (
            <small>
              {[
                dependency.requiredVersion &&
                  t('至少 {version}', { version: dependency.requiredVersion }),
                dependency.installedVersion &&
                  t('已安装 {version}', { version: dependency.installedVersion }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
          )}
        </li>
      ))}
    </ul>
  );
}
