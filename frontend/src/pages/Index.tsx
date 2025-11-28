import { Header } from "@/components/Header";
import { ContractList } from "@/components/ContractList";
import { CreateContract } from "@/components/CreateContract";
import { Footer } from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-4">Your Contracts</h2>
          <p className="text-muted-foreground">
            Create encrypted contracts or view pending approvals
          </p>
        </div>
        <CreateContract />
        <ContractList />
      </main>
      <Footer />
    </div>
  );
};

export default Index;


