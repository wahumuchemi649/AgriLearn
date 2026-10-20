import { useState } from 'react';
import { createCycle } from '../api/farm';

const MAIZE_ID = 1; // hardcoded — replace with a real crops picker later

export default function CreateCycle({ onCreated }) {
  const [mode, setMode] = useState('Guided');
  const [hours, setHours] = useState(2);

  async function handleSubmit(e) {
    e.preventDefault();
    const cycle = await createCycle({
      crop: MAIZE_ID,
      mode,
      real_duration_hours: hours,
      owner_type: 'student',
      student: 1, // hardcoded test student for now
    });
     console.log('created cycle:', cycle);  // ADD THIS
    onCreated(cycle.id);
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-3 max-w-sm">
      <h2 className="text-xl font-bold">Start a new Maize cycle</h2>

      <select value={mode} onChange={(e) => setMode(e.target.value)} className="border p-2 rounded">
        <option value="Guided">Guided</option>
        <option value="Free">Free</option>
      </select>

      <label className="text-sm text-gray-600">
        Real duration (hours)
        <input
          type="number"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="border p-2 rounded w-full"
        />
      </label>

      <button type="submit" className="bg-green-600 text-white p-2 rounded">
        Start Cycle
      </button>
    </form>
  );
}