import { useMutation } from '@tanstack/react-query';
import type { CreatedShare } from '../../../shared/recipe';
import { api } from '../../api';
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

  const share = useMutation({
    mutationFn: async () => {
      const res = await api.recipes[':id'].share.$post({ param: { id: recipeId } });
      if (res.status === 429) throw new Error('今日はこれ以上リンクを作れません');
      if (!res.ok) throw new Error('リンクを作れませんでした');
      return (await res.json()) as CreatedShare;
    },
    onSuccess: async ({ url }) => {
      const text = `「${recipeName}」のレシピを送ります。開いて「うちのレシピに保存」を押すと、あなたのレシピに追加されます。`;
      if (navigator.share) {
        try {
          await navigator.share({ title: recipeName, text, url });
          return;
        } catch (e) {
          // 共有シートを閉じただけなら何もしない
          if (e instanceof DOMException && e.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast('リンクをコピーしました。LINE などに貼り付けて送ってください');
      } catch {
        window.prompt('このリンクをコピーして送ってください', url);
      }
    },
    onError: (e) => toast(e.message, 'error'),
  });

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
