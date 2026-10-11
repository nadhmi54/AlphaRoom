import Header from '../../components/Header/Header.jsx';
import Markets from '../../components/Markets/Markets.jsx';
import Features from '../../components/Features/Features.jsx';
import AiExplained from '../../components/AiExplained/AiExplained.jsx';
import Team from '../../components/Team/Team.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import BackToTop from '../../components/BackToTop/BackToTop.jsx';

export default function HomePage() {
  return (
    <>
      <Header />
      <Markets />
      <Features />
      <AiExplained />
      <Team />
      <Footer />
      <BackToTop />
    </>
  );
}
