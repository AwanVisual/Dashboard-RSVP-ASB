import React, { useState, useEffect } from 'react';

// Pustaka akan dimuat secara dinamis dari CDN, bukan diimpor.

const App = () => {
  // --- KONFIGURASI PENTING ---
  // Ganti string kosong di bawah ini dengan URL dan Kunci Anon Supabase Anda.
  // Anda bisa menemukannya di Pengaturan Proyek > API di dasbor Supabase Anda.
  const SUPABASE_URL = "https://umqvnwmyoayrrdrwgkvk.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcXZud215b2F5cnJkcndna3ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTEwODMsImV4cCI6MjA3Mzc2NzA4M30.3OxEf8ln6zRo5F6_r4t8u1maLMG1VNfyzaFyFnHY1-8";

  // State untuk klien Supabase dan data
  const [supabase, setSupabase] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [libsLoaded, setLibsLoaded] = useState(false);

  // Efek untuk memuat skrip pustaka dari CDN secara dinamis
  useEffect(() => {
    const loadScript = (src, id) => new Promise((resolve, reject) => {
        if (document.getElementById(id)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });

    // Muat semua skrip yang diperlukan secara paralel
    Promise.all([
        loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', 'supabase-script'),
        loadScript('https://unpkg.com/xlsx/dist/xlsx.full.min.js', 'xlsx-script'),
        loadScript('https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js', 'jspdf-script'),
    ])
    .then(() => {
        // jspdf-autotable harus dimuat setelah jspdf
        return loadScript('https://unpkg.com/jspdf-autotable@latest/dist/jspdf.plugin.autotable.js', 'jspdf-autotable-script');
    })
    .then(() => {
        if (window.supabase) {
            const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            setSupabase(client);
        } else {
            throw new Error("Klien Supabase tidak ditemukan setelah skrip dimuat.");
        }
        setLibsLoaded(true);
    })
    .catch(err => {
        console.error("Gagal memuat satu atau lebih skrip penting:", err);
        setError("Gagal memuat pustaka eksternal. Silakan refresh halaman.");
        setLoading(false);
    });
  }, [SUPABASE_URL, SUPABASE_ANON_KEY]);


  // Efek untuk mengambil data dan mendengarkan perubahan realtime
  useEffect(() => {
    if (!supabase) return;

    const fetchResponses = async () => {
      // Tidak mengatur loading di sini agar spinner utama tidak berkedip saat realtime update
      setError(null);
      try {
        const { data, error } = await supabase
          .from('rsvp_responses')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setResponses(data || []);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(`Gagal mengambil data: ${err.message}.`);
      } finally {
        // Loading dihentikan hanya setelah pengambilan data awal selesai
        if(loading){
           setLoading(false);
        }
      }
    };

    fetchResponses();

    const channel = supabase
      .channel('public:rsvp_responses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rsvp_responses' }, () => {
        fetchResponses();
      })
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabase]);

  const handleExportExcel = () => {
    if (!libsLoaded || !window.XLSX) {
        alert("Pustaka ekspor belum siap, coba lagi.");
        return;
    }
    const worksheet = window.XLSX.utils.json_to_sheet(
      responses.map(r => ({
        'Nama': r.name,
        'Akan Hadir': r.will_attend ? 'Ya' : 'Tidak',
        'Jumlah Tamu': r.number_of_guests,
        'Waktu Kedatangan': r.arrival_time || 'N/A',
        'Email': r.email,
        'Telepon': r.phone,
        'Pesan': r.message,
        'Waktu Kirim': new Date(r.created_at).toLocaleString('id-ID')
      }))
    );
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "Respons RSVP");
    window.XLSX.writeFile(workbook, "Respons_RSVP.xlsx");
  };

  const handleExportPDF = () => {
    if (!libsLoaded || !window.jspdf || !window.jspdf.jsPDF) {
        alert("Pustaka ekspor PDF belum siap, coba lagi.");
        return;
    }
    const doc = new window.jspdf.jsPDF();
    doc.text("Daftar Respons RSVP", 14, 16);
    doc.autoTable({
      head: [['Nama', 'Hadir?', 'Tamu', 'Waktu Kedatangan', 'Email', 'Telepon', 'Waktu Kirim']],
      body: responses.map(r => [
        r.name,
        r.will_attend ? 'Ya' : 'Tidak',
        r.number_of_guests,
        r.arrival_time || 'N/A',
        r.email || '-',
        r.phone || '-',
        new Date(r.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
      ]),
      startY: 20,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
      margin: { top: 10 }
    });
    doc.save('Respons_RSVP.pdf');
  };

  const LoadingSpinner = () => (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  return (
    <div className="bg-gray-100 dark:bg-gray-900 min-h-screen font-sans text-gray-800 dark:text-gray-200">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Dasbor Respons RSVP</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Menampilkan data langsung dari database Supabase Anda.</p>
        </header>

        <main className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="p-4 flex flex-col sm:flex-row justify-between items-center border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2 sm:mb-0">Data Respons</h2>
            <div className="flex space-x-2">
              <button
                onClick={handleExportExcel}
                disabled={!libsLoaded || responses.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg shadow-sm hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">
                Export Excel
              </button>
              <button
                onClick={handleExportPDF}
                disabled={!libsLoaded || responses.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg shadow-sm hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors">
                Export PDF
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <LoadingSpinner />
            ) : error ? (
              <div className="p-8 text-center text-red-500 bg-red-100 dark:bg-red-900/20">
                <h3 className="font-bold text-lg mb-2">Terjadi Kesalahan</h3>
                <p className="text-sm">{error}</p>
              </div>
            ) : responses.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <h3 className="font-bold text-lg">Belum Ada Respons</h3>
                <p className="text-sm mt-1">Data akan muncul di sini setelah ada yang mengisi RSVP.</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-3">Nama</th>
                    <th scope="col" className="px-6 py-3">Akan Hadir?</th>
                    <th scope="col" className="px-6 py-3">Jumlah Tamu</th>
                    <th scope="col" className="px-6 py-3">Kontak</th>
                    <th scope="col" className="px-6 py-3">Pesan</th>
                    <th scope="col" className="px-6 py-3">Waktu Kedatangan</th>
                    <th scope="col" className="px-6 py-3">Waktu Kirim</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  {responses.map((rsvp) => (
                    <tr key={rsvp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">{rsvp.name}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          rsvp.will_attend
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {rsvp.will_attend ? 'Ya' : 'Tidak'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">{rsvp.number_of_guests}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span>{rsvp.email || '-'}</span>
                          <span className="text-xs text-gray-500">{rsvp.phone || '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs truncate" title={rsvp.message}>
                        {rsvp.message || <span className="text-gray-400 italic">Tidak ada pesan</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                        {rsvp.arrival_time || <span className="text-gray-400 italic">N/A</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                        {new Date(rsvp.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
              Total Respons: <span className="font-semibold text-gray-700 dark:text-gray-200">{responses.length}</span>
            </div>
          </div>
        </main>

        <footer className="text-center mt-8 text-sm text-gray-500">
          <p>Dasbor terhubung dengan Supabase.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;



