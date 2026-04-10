import { useSearchParams } from 'react-router-dom';
import HeroEditor from './HeroEditor';
import ActionEditor from './ActionEditor';

export default function EditorPage() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');

  if (type === 'action') {
    return <ActionEditor />;
  }

  return <HeroEditor />;
}
