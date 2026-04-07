const Home = () => {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <img src="/logo.avif" alt="POE.BOATS" width={80} height={80} className="rounded-lg" />
      <h1 className="font-heading text-4xl font-bold tracking-tight">POE.BOATS</h1>
      <p className="text-muted-foreground text-lg">Path of Exile tooling for the boat league.</p>
    </main>
  );
};

export default Home;
