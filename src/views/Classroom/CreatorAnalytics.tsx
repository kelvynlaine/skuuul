import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { TrendingUp, Users, BookOpen, Wallet, BarChart2 } from 'lucide-react';

interface RevenueRow { month: string; revenue: number; sales_count: number; }
interface CourseRow {
  course_id: string; title: string; price: number;
  student_count: number; total_lessons: number; avg_completion: number;
}
interface PayoutRow { id: string; amount: number; status: string; created_at: string; }

export const CreatorAnalytics: React.FC = () => {
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [revRes, courseRes, payoutRes] = await Promise.all([
      supabase.rpc('get_creator_revenue_stats'),
      supabase.rpc('get_creator_course_stats'),
      supabase.from('payout_requests').select('id, amount, status, created_at').order('created_at', { ascending: false }).limit(10),
    ]);
    if (revRes.data) setRevenue(revRes.data as RevenueRow[]);
    if (courseRes.data) setCourses(courseRes.data as CourseRow[]);
    if (payoutRes.data) setPayouts(payoutRes.data as PayoutRow[]);
    setLoading(false);
  };

  const totalRevenue = revenue.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totalStudents = courses.reduce((s, c) => s + (c.student_count ?? 0), 0);
  const maxRevenue = Math.max(...revenue.map(r => r.revenue ?? 0), 1);

  const monthLabel = (m: string) => {
    const d = new Date(m + '-01');
    return d.toLocaleDateString('fr-FR', { month: 'short' });
  };

  const payoutStatusColor: Record<string, string> = {
    pending: 'text-ios-orange-light dark:text-ios-orange-dark',
    approved: 'text-ios-green-light dark:text-ios-green-dark',
    rejected: 'text-ios-pink-light dark:text-ios-pink-dark',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-ios-blue-light dark:border-ios-blue-dark border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Revenus totaux', value: `${totalRevenue}€`, icon: Wallet, color: 'text-ios-green-light dark:text-ios-green-dark' },
          { label: 'Étudiants', value: totalStudents, icon: Users, color: 'text-ios-blue-light dark:text-ios-blue-dark' },
          { label: 'Cours actifs', value: courses.length, icon: BookOpen, color: 'text-ios-indigo-light dark:text-ios-indigo-dark' },
          { label: 'Ventes (12 mois)', value: revenue.reduce((s, r) => s + (r.sales_count ?? 0), 0), icon: TrendingUp, color: 'text-ios-orange-light dark:text-ios-orange-dark' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-card p-4 rounded-ios-xl">
            <Icon className={`w-5 h-5 mb-2 ${color}`} />
            <p className="text-xl font-extrabold">{value}</p>
            <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      {revenue.length > 0 && (
        <div className="glass-card p-5 rounded-ios-xl space-y-4">
          <h3 className="font-extrabold text-sm flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark" />
            Revenus par mois (12 derniers mois)
          </h3>
          <div className="flex items-end gap-2 h-32">
            {revenue.map(row => (
              <div key={row.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                  {row.revenue > 0 ? `${row.revenue}€` : ''}
                </span>
                <div
                  className="w-full rounded-t-ios-sm bg-ios-blue-light/20 dark:bg-ios-blue-dark/30 hover:bg-ios-blue-light/40 dark:hover:bg-ios-blue-dark/50 transition-colors relative overflow-hidden"
                  style={{ height: `${Math.max((row.revenue / maxRevenue) * 100, 4)}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-ios-blue-light/60 dark:from-ios-blue-dark/60 to-transparent" />
                </div>
                <span className="text-[9px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">{monthLabel(row.month)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Courses table */}
      {courses.length > 0 && (
        <div className="glass-card p-5 rounded-ios-xl space-y-3">
          <h3 className="font-extrabold text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-ios-indigo-light dark:text-ios-indigo-dark" />
            Performance par cours
          </h3>
          <div className="space-y-3">
            {courses.map(course => (
              <div key={course.course_id} className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold flex-1 min-w-0 truncate">{course.title}</p>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{course.student_count}</span>
                    <span>{Math.round(course.avg_completion)}%</span>
                  </div>
                </div>
                {/* Completion bar */}
                <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-ios-green-light dark:bg-ios-green-dark transition-all duration-500"
                    style={{ width: `${course.avg_completion}%` }}
                  />
                </div>
                <p className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                  {course.total_lessons} leçons • taux de complétion moyen : {Math.round(course.avg_completion)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payout history */}
      {payouts.length > 0 && (
        <div className="glass-card p-5 rounded-ios-xl space-y-3">
          <h3 className="font-extrabold text-sm flex items-center gap-2">
            <Wallet className="w-4 h-4 text-ios-orange-light dark:text-ios-orange-dark" />
            Historique des retraits
          </h3>
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {payouts.map(p => (
              <div key={p.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{p.amount}€</p>
                  <p className="text-[11px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                    {new Date(p.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <span className={`text-xs font-bold capitalize ${payoutStatusColor[p.status] ?? ''}`}>
                  {p.status === 'approved' ? 'Approuvé' : p.status === 'rejected' ? 'Refusé' : 'En attente'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {courses.length === 0 && revenue.length === 0 && (
        <div className="text-center py-12">
          <BarChart2 className="w-10 h-10 mx-auto mb-3 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark opacity-30" />
          <p className="font-bold">Pas encore de données</p>
          <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1">
            Créez et publiez des cours pour voir vos analytics ici.
          </p>
        </div>
      )}
    </div>
  );
};
