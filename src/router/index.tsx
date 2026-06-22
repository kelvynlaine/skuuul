import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import { AdminRoute } from '../components/layout/AdminRoute';
import { Auth } from '../views/Auth/Auth';
import { Community } from '../views/Community/Community';
import { Classroom } from '../views/Classroom/Classroom';
import { Leaderboard } from '../views/Gamification/Leaderboard';
import { Admin } from '../views/Admin/Admin';
import { LiveRooms } from '../views/Live/LiveRooms';
import { AdminDirectory } from '../views/Community/AdminDirectory';
import { CollaborativeList } from '../views/Collaborative/CollaborativeList';
import { CollaborativeCanvas } from '../views/Collaborative/CollaborativeCanvas';
import { CollaborativeJoin } from '../views/Collaborative/CollaborativeJoin';
import { ProfilePage } from '../views/Profile/ProfilePage';
import { MessagesView } from '../views/Messages/MessagesView';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Auth />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: '',
        element: <Community />,
      },
      {
        path: 'classroom',
        element: <Classroom />,
      },
      {
        path: 'leaderboard',
        element: <Leaderboard />,
      },
      {
        path: 'live',
        element: <LiveRooms />,
      },
      {
        path: 'admins',
        element: <AdminDirectory />,
      },
      {
        path: 'collaborative',
        element: <CollaborativeList />,
      },
      {
        path: 'collaborative/:id',
        element: <CollaborativeCanvas />,
      },
      {
        path: 'collaborative/join/:id',
        element: <CollaborativeJoin />,
      },
      {
        path: 'profile/:username',
        element: <ProfilePage />,
      },
      {
        path: 'messages',
        element: <MessagesView />,
      },
      {
        path: 'admin',
        element: (
          <AdminRoute>
            <Admin />
          </AdminRoute>
        ),
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
