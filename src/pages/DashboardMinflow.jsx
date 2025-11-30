// src/pages/DashboardMindFlow.jsx
import React from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Zap, CloudSun, Battery, Moon } from "lucide-react";

const mockMoodWave = [
  { name: "Mon", value: 6.5 },
  { name: "Tue", value: 7.0 },
  { name: "Wed", value: 8.0 },
  { name: "Thu", value: 7.8 },
  { name: "Fri", value: 8.5 },
  { name: "Sat", value: 9.0 },
  { name: "Sun", value: 8.8 },
];

function StatCard({ icon, title, value, note }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3">
      <div className="p-2 rounded-full bg-purple-50 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-gray-400 truncate">{title}</div>
        <div className="text-lg sm:text-xl font-semibold leading-tight">{value}</div>
        {note && <div className="text-xs text-gray-400 mt-1 truncate">{note}</div>}
      </div>
    </div>
  );
}

export default function DashboardMindFlow() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />

      <main className="flex-1 p-4 sm:p-6 md:p-8">
        <Header />

        {/* Page header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-lg sm:text-2xl md:text-3xl font-extrabold">MindFlow</h1>
            <p className="text-sm text-gray-500 mt-1">A quick view of your mood, energy and activity.</p>
          </div>

          <div className="flex gap-3 items-center">
            <button className="hidden sm:inline-flex items-center gap-2 bg-gradient-to-r from-teal-400 to-blue-500 text-white py-2 px-4 rounded-lg shadow-sm text-sm">
              <Zap className="w-4 h-4" /> Quick Actions
            </button>

            {/* On small screens show a single primary action button full width beneath header */}
            <button className="sm:hidden w-full bg-gradient-to-r from-teal-400 to-blue-500 text-white py-2 px-4 rounded-lg shadow-sm text-sm">
              Quick Calm
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Mood Wave - spans 2 cols on medium+ */}
          <div className="sm:col-span-2 lg:col-span-2 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-4 sm:p-6 text-white">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base sm:text-lg font-semibold">Your Mood Wave</h3>
                <p className="text-xs sm:text-sm text-purple-100/80 mt-1">Weekly overview of your mood score</p>
              </div>
              <div className="text-xs text-purple-100/90 hidden sm:block">Updated: today</div>
            </div>

            <div className="h-56 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockMoodWave}>
                  <defs>
                    <linearGradient id="gradMood" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgba(255,255,255,0.9)" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="rgba(255,255,255,0.1)" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>

                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#fff"
                    strokeWidth={2}
                    fill="url(#gradMood)"
                    fillOpacity={0.8}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-purple-100">Keep tracking regularly for better insights.</div>
              <div className="flex gap-2">
                <button className="hidden sm:inline-flex items-center gap-2 bg-white/10 text-white py-2 px-3 rounded-lg text-sm">Export</button>
                <button className="bg-white text-indigo-700 py-2 px-4 rounded-lg font-medium text-sm">View Details</button>
              </div>
            </div>
          </div>

          {/* Quick Calm (on larger screens) */}
          <div className="bg-white rounded-2xl p-4 sm:p-6 shadow flex flex-col justify-between">
            <div>
              <h4 className="font-semibold mb-2">Quick Calm</h4>
              <p className="text-sm text-gray-500 mb-4">Start a 3-minute breathing session to reset your attention.</p>
            </div>
            <div className="pt-2">
              <button className="w-full sm:w-auto bg-gradient-to-r from-teal-400 to-blue-500 text-white py-2 px-4 rounded-lg shadow-sm">Start 3-min session</button>
            </div>
          </div>

          {/* Stat cards grid */}
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={<CloudSun className="w-5 h-5 text-indigo-500" />} title="Overall Mood" value="7.8" note="+12% from last week" />
            <StatCard icon={<Battery className="w-5 h-5 text-green-500" />} title="Energy" value="85%" note="Above average" />
            <StatCard icon={<Moon className="w-5 h-5 text-purple-500" />} title="Sleep" value="6.5h" note="Good rest" />
          </div>

          {/* Recent Activities */}
          <div className="sm:col-span-2 lg:col-span-2 bg-white rounded-2xl p-4 sm:p-6 mt-2 shadow">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">Recent Activities</h4>
              <div className="text-xs text-gray-400">Latest</div>
            </div>

            <div className="space-y-3">
              <div className="p-3 border rounded-lg">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <strong className="block">Mood Check-in</strong>
                    <div className="text-sm text-gray-500 truncate">Feeling optimistic today</div>
                  </div>
                  <div className="text-sm text-gray-400">2 hours ago</div>
                </div>
              </div>

              <div className="p-3 border rounded-lg">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <strong className="block">Breathing Session</strong>
                    <div className="text-sm text-gray-500 truncate">2 min guided</div>
                  </div>
                  <div className="text-sm text-gray-400">Yesterday</div>
                </div>
              </div>

              <div className="p-3 border rounded-lg">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <strong className="block">Reflection</strong>
                    <div className="text-sm text-gray-500 truncate">Quick note on what went well</div>
                  </div>
                  <div className="text-sm text-gray-400">3 days ago</div>
                </div>
              </div>
            </div>
          </div>

          {/* Empty spacer on large to keep layout balanced */}
          <div className="hidden lg:block" />
        </div>
      </main>
    </div>
  );
}
