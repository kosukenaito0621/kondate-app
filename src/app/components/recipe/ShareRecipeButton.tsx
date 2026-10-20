import { useMutation } from '@tanstack/react-query';
import { useIsGuest } from '../../lib/auth';
import type { CreatedShare } from '../../../shared/recipe';
import { api } from '../../api';
import { shareOrCopy } from '../../lib/shareLink';
import { GlassButton } from '../glass/GlassButton';
import { LinkIcon } from '../icons';
import { useToast } from '../toast/Toaster';

/**
 * 「レシピを送る」：共有リンクを作り、LINE などで送る。
 * 受け取った人はリンクを開いて、自分のレシピとして保存できる（ほかのグループの人でもよい）。
 */
export function ShareRecipeButton({
  recipeId,
  recipeName,
}: {
  recipeId: string;
  recipeName: string;
}) {
  const { toast } = useToast();

  const guest = useIsGuest();
  const share = useMutation({
    mutationFn: async () => {
      const res = await api.recipes[':id'].share.$post({ param: { id: recipeId } });
      if (res.status === 429) throw new Error('今日はこれ以上リンクを作れません');
      if (!res.ok) throw new Error('リンクを作れませんでした');
      return (await res.json()) as CreatedShare;
    },
    onSuccess: ({ url }) =>
      shareOrCopy({
        title: recipeName,
        text: `「${recipeName}」のレシピを送ります。開いて「うちのレシピに保存」を押すと、あなたのレシピに追加されます。`,
        url,
        toast,
      }),
    onError: (e) => toast(e.message, 'error'),
  });

  // お試しでは共有リンクを作れない
  if (guest) return null;

  return (
    <GlassButton
      icon={<LinkIcon size={18} />}
      loading={share.isPending}
      onClick={() => share.mutate()}
      block
    >
      レシピを送る
    </GlassButton>
  );
}
