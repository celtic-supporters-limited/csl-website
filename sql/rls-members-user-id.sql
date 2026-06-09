-- Replace email-based RLS policies with user_id-based policies
DROP POLICY IF EXISTS "Members can view own record" ON public.members;
DROP POLICY IF EXISTS "Members can update own record" ON public.members;

CREATE POLICY "Members can view own record"
  ON public.members FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Members can update own record"
  ON public.members FOR UPDATE USING (auth.uid() = user_id);
