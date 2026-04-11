import { AnimapPreview } from '@/components/AnimapPreview';

interface HeroPosePreviewProps {
  slug: string;
  fill?: 'contain' | 'cover' | 'stretch' | 'none';
}

export function HeroPosePreview({ slug, fill = 'cover' }: HeroPosePreviewProps) {
  return (
    <AnimapPreview slug={`pose-${slug}`} fill={fill} fallbackLabel={slug} />
  );
}
