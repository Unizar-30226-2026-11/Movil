import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  ScrollView,
  ImageBackground,
  Animated,
  Easing,
  Modal
} from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useRouter } from 'expo-router';

SplashScreen.preventAutoHideAsync();

type Comodin = {
  id: string;
  valor: number;
};

function Card({ image, selected, isVoting, onSelect }: any) {
  return (
    <View style={styles.cardWrapper}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onSelect}
        style={[
          styles.card,
          selected && styles.cardSelected,
          isVoting && selected && styles.cardSelectedVoting
        ]}
      >
        <Image source={{ uri: image }} style={styles.cardImage} />
      </TouchableOpacity>
    </View>
  );
}

function FichaJugador({ jugador, size = 12 }: any) {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animValue.setValue(0);
    Animated.timing(animValue, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
  }, [animValue, jugador.puntos]);

  return (
    <Animated.View 
      style={[
        styles.fichaJugador, 
        { 
          backgroundColor: jugador.color,
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [
            { scale: animValue.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.4, 1] }) }
          ]
        }
      ]} 
    />
  );
}

export default function GameScreen() {
  const router = useRouter();

  const [fasePartida, setFasePartida] = useState('elegir'); 
  const [cartaJugadaPropia, setCartaJugadaPropia] = useState<string | null>(null);
  const [cartaVotada, setCartaVotada] = useState<string | null>(null);
  const [accionConfirmada, setAccionConfirmada] = useState(false);
  const [tableroDesplegado, setTableroDesplegado] = useState(false); 
  const [estadoBots, setEstadoBots] = useState(0); 
  
  const [fraseActual, setFraseActual] = useState('Una mirada perdida.');
  
  const [comodines, setComodines] = useState<Comodin[]>([]);
  
  const [modalComodinVisible, setModalComodinVisible] = useState(false);
  const [comodinReciente, setComodinReciente] = useState<number | null>(null);

  const pistasMock = [
    'Una mirada perdida.',
    'El último tren a ninguna parte.',
    'Un silencio ensordecedor.',
    'El peso de la corona.',
    'Caída libre sin paracaídas.',
    'Un reflejo engañoso.',
    'Buscando a Nemo pero mal.'
  ];

  const [loaded, error] = useFonts({
    FuenteTitulo: require('../assets/fonts/fuente-dilana.ttf'),
  });

  const [jugadores, setJugadores] = useState([
    { id: 'u1', nombre: 'hackeeper', color: '#e67e22', yo: true, puntos: 1 },
    { id: 'u2', nombre: 'Azzal-e', color: '#2ecc71', yo: false, puntos: 1 },
    { id: 'u3', nombre: 'Natur4', color: '#3498db', yo: false, puntos: 1 },
    { id: 'u4', nombre: 'Stella', color: '#9b59b6', yo: false, puntos: 1 },
  ]);

  const misCartas = [
    { id: 'c1', image: 'https://picsum.photos/300/400?10' },
    { id: 'c2', image: 'https://picsum.photos/300/400?11' },
    { id: 'c3', image: 'https://picsum.photos/300/400?12' },
    { id: 'c4', image: 'https://picsum.photos/300/400?13' },
  ];

  const cartasVotacion = [
    { id: 'v1', image: 'https://picsum.photos/300/400?14' },
    { id: 'v2', image: 'https://picsum.photos/300/400?15' },
    { id: 'v3', image: 'https://picsum.photos/300/400?16' },
    { id: 'v4', image: 'https://picsum.photos/300/400?17' },
  ];

  const casillasTablero = Array.from({ length: 42 }).map((_, i) => ({
    numero: i + 1,
    tipo: i % 5 === 0 ? 'gema' : 'normal',
    color: i % 5 === 0 ? '#d988b3' : '#e0e6ed'
  }));

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  const handleJugarCarta = () => {
    if (!cartaJugadaPropia) return;
    setAccionConfirmada(true);
    setEstadoBots(1);

    setTimeout(() => setEstadoBots(2), 1000);
    setTimeout(() => setEstadoBots(3), 2000);
    setTimeout(() => {
      setEstadoBots(0);
      setAccionConfirmada(false);
      setFasePartida('votacion');
    }, 3000);
  };

  const handleVotarCarta = () => {
    if (!cartaVotada) return;
    setAccionConfirmada(true);
    setEstadoBots(1);
    setFasePartida('puntuacion'); 
    
    setTimeout(() => setEstadoBots(2), 1000);
    setTimeout(() => setEstadoBots(3), 2500);
    
    setTimeout(() => {
      setEstadoBots(4); 
      setTableroDesplegado(true); 
      
      setTimeout(() => {
        setJugadores(prev => {
          const nuevosJugadores = prev.map(j => ({
            ...j,
            puntos: Math.min(42, j.puntos + Math.floor(Math.random() * 6) + 1)
          }));

          const miJugador = nuevosJugadores.find(j => j.yo);
          if (miJugador && (miJugador.puntos - 1) % 5 === 0) {
            setTimeout(() => {
              const valorComodin = Math.floor(Math.random() * 3) + 1;
              setComodines(comos => [...comos, { id: Date.now().toString(), valor: valorComodin }]);
              setComodinReciente(valorComodin);
              setModalComodinVisible(true);
            }, 500);
          }

          return nuevosJugadores;
        });
        
        setTimeout(() => {
            const pistaRandom = pistasMock[Math.floor(Math.random() * pistasMock.length)];
            setFraseActual(pistaRandom); 

            setFasePartida('elegir');
            setCartaJugadaPropia(null);
            setCartaVotada(null);
            setAccionConfirmada(false);
            setEstadoBots(0);
        }, 4000);

      }, 1000);
    }, 3500);
  };

  const simularComodinManual = () => {
    const valorComodin = Math.floor(Math.random() * 3) + 1;
    setComodines(prev => [...prev, { id: Date.now().toString(), valor: valorComodin }]);
    setComodinReciente(valorComodin);
    setModalComodinVisible(true);
  };

  const usarComodin = (id: string, valor: number) => {
    setComodines(prev => prev.filter(c => c.id !== id));
    setJugadores(prev => prev.map(j => 
      j.yo ? { ...j, puntos: Math.min(42, j.puntos + valor) } : j
    ));
    setTableroDesplegado(true);
  };

  if (!loaded && !error) return null;

  return (
    <ImageBackground source={require('../assets/images/background.jpg')} style={styles.background} resizeMode="cover">
      <SafeAreaView style={styles.safeArea}>

        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Text style={styles.headerButtonText}>Home</Text>
          </TouchableOpacity>

          <View style={styles.fasePill}>
            <Text style={styles.fasePillText}>SALA 1</Text>
          </View>

          <View style={{ width: 60 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          <View style={styles.panelGlass}>
            <Text style={styles.faseLabel}>
              {fasePartida === 'elegir' ? 'PISTA ACTUAL' : fasePartida === 'votacion' ? 'VOTACIÓN' : 'PUNTUACIÓN'}
            </Text>
            
            <Text style={styles.phraseText}>{fraseActual}</Text>
            
            {fasePartida === 'elegir' && (
              <View style={styles.elegirContainer}>
                {!accionConfirmada ? (
                   <>
                    <Text style={styles.instruccionText}>Elige una carta de tu mano y colócala en la mesa.</Text>
                    <View style={styles.cartaPlaceholder}>
                      {cartaJugadaPropia ? (
                        <Image source={{ uri: misCartas.find(c => c.id === cartaJugadaPropia)?.image }} style={styles.cartaPlaceholderImg} />
                      ) : (
                        <Text style={styles.placeholderText}>Toca una carta de abajo.</Text>
                      )}
                    </View>
                    <TouchableOpacity 
                      style={[styles.botonAccion, {marginTop: 20}, !cartaJugadaPropia && {opacity: 0.5}]} 
                      onPress={handleJugarCarta}
                      disabled={!cartaJugadaPropia}
                    >
                      <Text style={styles.botonAccionText}>Confirmar Carta</Text>
                    </TouchableOpacity>
                   </>
                ) : (
                    <View style={styles.puntuacionContainer}>
                        <Text style={styles.instruccionText}>Esperando a que el resto elija sus cartas...</Text>
                        <View style={styles.progressBarContainer}>
                            <Text style={styles.progressText}>{estadoBots + 1} / 4 jugadores listos.</Text>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, {width: `${((estadoBots + 1) / 4) * 100}%`}]} />
                            </View>
                        </View>
                    </View>
                )}
              </View>
            )}

            {fasePartida === 'votacion' && (
              <View style={styles.votacionContainer}>
                <Text style={styles.instruccionText}>Has elegido {cartaVotada || 'ninguna'}.</Text>
                
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.votacionScroll}>
                  {cartasVotacion.map((c) => (
                    <Card 
                      key={c.id} 
                      image={c.image} 
                      selected={cartaVotada === c.id} 
                      isVoting={true}
                      onSelect={() => !accionConfirmada && setCartaVotada(c.id)} 
                    />
                  ))}
                </ScrollView>

                <View style={styles.votacionFooter}>
                  <Text style={styles.instruccionText}>Tu voto actual es {cartaVotada || 'ninguno'}.</Text>
                  <TouchableOpacity 
                    style={[styles.botonAccion, accionConfirmada && styles.botonAccionDisabled]} 
                    onPress={handleVotarCarta}
                    disabled={accionConfirmada || !cartaVotada}
                  >
                    <Text style={[styles.botonAccionText, (!cartaVotada) && {color: '#888'}]}>
                      {accionConfirmada ? 'Voto enviado' : 'Confirmar voto'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {fasePartida === 'puntuacion' && (
              <View style={styles.puntuacionContainer}>
                 <Text style={styles.instruccionText}>Calculando puntuaciones de la ronda...</Text>
                 <View style={styles.progressBarContainer}>
                    <Text style={styles.progressText}>{estadoBots + 1} / 4 votos recibidos.</Text>
                    <View style={styles.progressBarBg}>
                       <View style={[styles.progressBarFill, {width: `${((estadoBots + 1) / 4) * 100}%`}]} />
                    </View>
                 </View>
              </View>
            )}
          </View>

          <View style={styles.bottomAreaRow}>
            <View style={[styles.panelGlass, styles.manoPanel]}>
              <View style={styles.manoHeaderRow}>
                <View>
                  <Text style={styles.seccionLabel}>TU MANO</Text>
                  <Text style={styles.tituloFantasia}>Cartas disponibles</Text>
                </View>
                <View style={{alignItems: 'flex-end'}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
                    <Text style={styles.seccionLabel}>COMODINES</Text>
                    <TouchableOpacity onPress={simularComodinManual} style={styles.debugBtn}>
                      <Ionicons name="add-circle" size={16} color="#d988b3" />
                    </TouchableOpacity>
                  </View>
                  {comodines.length === 0 ? (
                    <Text style={styles.comodinText}>Sin comodines todavía.</Text>
                  ) : (
                    <ScrollView horizontal style={styles.comodinesList}>
                      {comodines.map(c => (
                        <TouchableOpacity 
                          key={c.id} 
                          style={styles.comodinBtn} 
                          onPress={() => usarComodin(c.id, c.valor)}
                        >
                          <Text style={styles.comodinBtnText}>+{c.valor}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </View>
              
              <View style={styles.manoCartasRow}>
                {misCartas.map((c) => (
                  <Card 
                    key={c.id} 
                    image={c.image} 
                    selected={fasePartida === 'elegir' && cartaJugadaPropia === c.id} 
                    isVoting={false}
                    onSelect={() => {
                        if(fasePartida === 'elegir' && !accionConfirmada) {
                            setCartaJugadaPropia(c.id);
                        }
                    }} 
                  />
                ))}
              </View>
            </View>

            <View style={[styles.panelGlass, styles.jugadoresPanel]}>
              <Text style={styles.seccionLabel}>JUGADORES</Text>
              <Text style={styles.tituloFantasia}>Mes actual</Text>
              <View style={styles.listaJugadores}>
                {jugadores.map(j => (
                  <View key={j.id} style={styles.jugadorRow}>
                    <View style={[styles.colorDot, {backgroundColor: j.color}]} />
                    <View style={{flex: 1, flexDirection: 'row', justifyContent: 'space-between'}}>
                      <Text style={styles.jugadorNombre} numberOfLines={1}>{j.nombre}</Text>
                      <Text style={styles.jugadorPuntosTexto}>{j.puntos} pts</Text>
                    </View>
                    {j.yo && <View style={styles.yoBadge}><Text style={styles.yoBadgeText}>Tu</Text></View>}
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.panelGlass}>
            <TouchableOpacity 
              style={styles.acordeonTablero} 
              activeOpacity={0.8} 
              onPress={() => setTableroDesplegado(!tableroDesplegado)}
            >
              <Text style={styles.seccionLabel}>TABLERO</Text>
              <Ionicons name={tableroDesplegado ? "chevron-up" : "chevron-down"} size={20} color="#8caea6" />
            </TouchableOpacity>

            {tableroDesplegado && (
               <View style={styles.tableroMock}>
                 {casillasTablero.map(c => {
                   const ocupantes = jugadores.filter(j => j.puntos === c.numero);

                   return (
                     <View key={c.numero} style={[styles.casilla, c.tipo === 'gema' && styles.casillaGema, {borderColor: c.color}]}>
                       <Text style={[styles.casillaNum, c.tipo === 'gema' && {color: c.color}]}>{c.numero}</Text>
                       
                       {ocupantes.length > 0 && (
                         <View style={styles.fichasContainer}>
                           {ocupantes.map(j => (
                             <FichaJugador key={j.id} jugador={j} />
                           ))}
                         </View>
                       )}
                     </View>
                   );
                 })}
               </View>
            )}
          </View>

        </ScrollView>

        <Modal visible={modalComodinVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Ionicons name="star" size={60} color="#d988b3" />
              <Text style={styles.modalTitle}>¡Comodín conseguido!</Text>
              <Text style={styles.modalText}>
                Has caído en una casilla especial y has ganado un salto de <Text style={{fontWeight: 'bold', color: '#d988b3'}}>+{comodinReciente}</Text> casillas. Úsalo cuando quieras.
              </Text>
              <TouchableOpacity style={styles.modalButton} onPress={() => setModalComodinVisible(false)}>
                <Text style={styles.modalButtonText}>Aceptar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: 'rgba(12, 28, 40, 0.7)' },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168, 200, 192, 0.2)',
  },
  headerButton: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20 },
  headerButtonText: { color: '#e0e6ed', fontSize: 13, fontWeight: 'bold' },
  
  fasePill: { backgroundColor: 'transparent', paddingHorizontal: 20, paddingVertical: 6 },
  fasePillText: { color: '#FCEEB5', fontWeight: 'bold', fontSize: 16, letterSpacing: 2 },

  scrollContent: { padding: 15, gap: 15, paddingBottom: 40 },

  panelGlass: {
    backgroundColor: 'rgba(30, 60, 75, 0.8)',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(168, 200, 192, 0.3)',
    padding: 18,
  },

  faseLabel: { color: '#8caea6', fontSize: 11, fontWeight: 'bold', letterSpacing: 2, marginBottom: 5 },
  phraseText: { fontSize: 32, color: '#FCEEB5', fontFamily: 'FuenteTitulo', marginBottom: 15 },
  instruccionText: { color: '#a0b0b9', fontSize: 14, marginBottom: 15 },

  elegirContainer: { alignItems: 'center' },
  cartaPlaceholder: { width: 140, height: 210, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', borderColor: '#8caea6', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  cartaPlaceholderImg: { width: '100%', height: '100%' },
  placeholderText: { color: '#8caea6', textAlign: 'center', padding: 20, fontSize: 13 },

  votacionContainer: {},
  votacionScroll: { gap: 10, paddingBottom: 10 },
  votacionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 },
  
  botonAccion: { backgroundColor: '#FCEEB5', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  botonAccionDisabled: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2ecc71' },
  botonAccionText: { color: '#1a2a3a', fontWeight: 'bold' },

  puntuacionContainer: { marginTop: 10, width: '100%' },
  progressBarContainer: { backgroundColor: 'rgba(0,0,0,0.3)', padding: 15, borderRadius: 10 },
  progressText: { color: '#e0e6ed', marginBottom: 10, fontSize: 13 },
  progressBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#e74c3c' },

  bottomAreaRow: { flexDirection: 'column', gap: 15 },
  
  manoPanel: { flex: 1 },
  manoHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  seccionLabel: { color: '#8caea6', fontSize: 10, fontWeight: 'bold', letterSpacing: 1.5 },
  tituloFantasia: { color: '#FCEEB5', fontSize: 22, fontFamily: 'FuenteTitulo', marginTop: 2 },
  
  comodinText: { color: '#a0b0b9', fontSize: 12, marginTop: 4 },
  comodinesList: { flexDirection: 'row', marginTop: 4 },
  comodinBtn: { backgroundColor: '#d988b3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#FCEEB5', marginLeft: 5 },
  comodinBtnText: { color: '#1a2a3a', fontWeight: 'bold', fontSize: 12 },
  debugBtn: { paddingLeft: 5, marginTop: -2 },

  manoCartasRow: { flexDirection: 'row', justifyContent: 'space-around' },

  jugadoresPanel: { flex: 1 },
  listaJugadores: { marginTop: 10, gap: 8 },
  jugadorRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 10 },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  jugadorNombre: { color: '#e0e6ed', fontSize: 14, fontWeight: '500', paddingRight: 10 },
  jugadorPuntosTexto: { color: '#8caea6', fontSize: 14, fontWeight: 'bold' },
  yoBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 10 },
  yoBadgeText: { color: '#FCEEB5', fontSize: 10, fontWeight: 'bold' },

  acordeonTablero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tableroMock: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15, justifyContent: 'center' },
  casilla: { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 8, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  casillaGema: { transform: [{ rotate: '45deg' }], backgroundColor: 'transparent', borderWidth: 2 },
  casillaNum: { fontSize: 12, fontWeight: 'bold', color: '#1a2a3a', transform: [{ rotate: '0deg' }] },
  
  fichasContainer: { position: 'absolute', bottom: -5, flexDirection: 'row', gap: 2, flexWrap: 'wrap', justifyContent: 'center', width: '100%', zIndex: 10 },
  fichaJugador: { borderWidth: 1, borderColor: '#fff' },

  cardWrapper: { alignItems: 'center', marginHorizontal: 5 },
  card: { width: 85, height: 125, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: '#dce8e3' },
  cardSelected: { borderColor: '#3498db', transform: [{ translateY: -10 }] },
  cardSelectedVoting: { borderColor: '#FCEEB5', borderWidth: 3 },
  cardImage: { width: '100%', height: '100%' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalContent: { width: '85%', backgroundColor: 'rgba(30, 60, 75, 0.98)', borderRadius: 20, padding: 30, alignItems: 'center', borderWidth: 2, borderColor: '#d988b3' },
  modalTitle: { fontSize: 24, fontFamily: 'FuenteTitulo', color: '#FCEEB5', marginVertical: 15, textAlign: 'center' },
  modalText: { fontSize: 15, color: '#e0e6ed', textAlign: 'center', marginBottom: 25, lineHeight: 22 },
  modalButton: { backgroundColor: '#d988b3', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25 },
  modalButtonText: { color: '#1a2a3a', fontWeight: 'bold', fontSize: 16 },
});
